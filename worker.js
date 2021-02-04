const { searchYA } = require('./parsers/search/yandex');
const { getPreparedDonors } = require('./parsers/get_html/get');
const { cleanGarbage, removeHtmlTags, insertMoreTag } = require('./parsers/dom_utils');
const { processBlocks } = require('./parsers/article_structure/process_blocks');
const { imgProcessing } = require('./parsers/post_processing');
const { getMeta } = require('./parsers/meta');
const cyrillicToTranslit = require('cyrillic-to-translit-js');
const natural = require('natural');
const { uploadArticle, articleExists } = require('./parsers/wp_upload');
// const { getTasks, getArticles, countArticles, updateTask, updateArticle } = require('./apiCalls');
const APICalls = require('./apiCalls');
const { translateTo } = require('./parsers/translater');
const { processDownloadStructure } = require('./parsers/article_structure/download');
const { parseString } = require('xml2js');
const CronJob = require('cron').CronJob;
const translate = require('@vitalets/google-translate-api');

let IN_PROGRESS = false;
let TASK_ID;
let WORKER_ID;

const parser = async (task, articles) => {
    const tokenizer = new natural.WordTokenizer();
    try {

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            let keyword = article.keyword.trim();

            // no keyword || category undefined || exceed tries
            if (!keyword || !article.category.trim()) {
                await APICalls.updateArticle(article.id, { is_skipped: true });
                continue;
            }

            if (article.is_skipped) {
                continue;
            }

            if (article.is_done && article.is_uploaded) {
                continue;
            }

            let timer = process.hrtime();
            let tries = 0;
            let processed;
            while ( tries < 3 && !processed) {
                console.log("[" + new Date().toISOString() + "] ATTEMPT #" + (tries + 1) );
                try {
                    processed = await processArticle(task, article, tokenizer, keyword, tries);
                } catch (error) {
                    console.log(error)
                    tries++;
                }
            }

            if (!processed) {
                console.log("[" + new Date().toISOString() + "] PARSING FAILED, SKIPPING" );
                await APICalls.updateArticle(article.id, { is_skipped: true });
            }

            let elapsed = process.hrtime(timer)[0];
            console.log('TIME: ' + elapsed + ' seconds.');

        }
        return true;
    } catch (err) {
        console.log(err)
        return false;
    }
}

const processArticle = async (task, article, tokenizer, keyword, tries) => {
    let domain = task.domain;

    // get latest updated article
    if (tries > 0) {
        article = await APICalls.getArticles({id: article.id})
        if (article && article.length === 1) {
            article = article[0];
        }
    }

    let slug = '';
    let keyword_translated = '';
    if (task.translateTo && task.translateTo !== 'no') {
        try {
            keyword_translated = await translate(keyword, { to: task.translateTo });
            keyword_translated = keyword_translated.text;
        } catch (error) {
            console.log(error);
            throw new Error('KW translation failed');
        }

        slug = tokenizer
                .tokenize(keyword_translated) //  tokenizing
                .slice(0, 8) // take maximum 9 words
                .join('-') // slug-like glue
                .toLowerCase();
    } else {
            // create slug
        slug = tokenizer
            .tokenize(cyrillicToTranslit().transform(keyword)) // cyr to translit + tokenizing
            .slice(0, 8) // take maximum 9 words
            .join('-') // slug-like glue
            .toLowerCase();
    }


    if (!article.is_done) {

        // check if already exists on the website
        let exists = await articleExists(task, slug); //returns id or false
        if (exists) {
            await APICalls.updateArticle(article.id, { slug, wp_id: exists, is_done: true, is_uploaded: true });
            return true;
        }

        await APICalls.updateArticle(article.id, { slug });

        console.log("[" + new Date().toISOString() + "] PARSING STARTED, KW: [" + keyword + "] ...")
        let urls = await searchYA(keyword, task);

        if (!urls) {
            throw new Error('Yandex XML returned error');
        }

        console.log("[" + new Date().toISOString() + "] GETTING HTML ...")
        let parsedContent = await getPreparedDonors(task, urls);
        if (parsedContent === false) {
            throw new Error('Couldn\'t get HTML, no donors to work with');
        }
        
        console.log("[" + new Date().toISOString() + "] PROCESSING TEXTS ...")
        let processedContent = false;
        if (!task.parser_type || task.parser_type === 'standard') {
            processedContent = processBlocks(parsedContent);
            if (processedContent === false) {
                throw new Error('Probably failed to get Intro text or no headers found, skipping');
            }
        }

        if (task.parser_type && task.parser_type === 'download') {
            processedContent = processDownloadStructure(parsedContent);
            if (processedContent === false) {
                throw new Error('Failed to fetch/process articles');
            }
        }
        
        let [finalContent, usedDonors] = processedContent;

        if (usedDonors.length < 3) {
            throw new Error('Not enough donors were used, skipped');
        }

        finalContent = cleanGarbage(finalContent);
        let finalText = removeHtmlTags(finalContent);

        // add more tag
        finalContent = insertMoreTag(finalContent);

        if (finalText.length < 3000) {
            throw new Error('Not enough text length, skipped');
        }
        
        let meta = getMeta(keyword_translated ? keyword_translated : keyword, parsedContent, finalText);

        if (task.translateTo && task.translateTo !== 'no') {
            try {
                meta.title = await translate(meta.title, { to: 'es' });
                meta.title = meta.title.text;
                meta.description = await translate(meta.description, { to: 'es' });
                meta.description = meta.description.text;
            } catch (error) {
                console.log(error);
                throw new Error ('META translation failed');
            }
            try {
                console.log("[" + new Date().toISOString() + "] TRANSLATING ...")
                finalContent = await translateTo(finalContent, task.translateTo);
                if (finalContent === false) {
                    throw new Error("Text has Russian symbols, returning false");
                }
            } catch (error) {
                console.log(error);
                throw new Error('CONTENT translation failed');
            }
        }
        
        console.log("[" + new Date().toISOString() + "] PROCESSING IMGS ...")
        let processedImages = await imgProcessing(domain, keyword_translated ? keyword_translated : keyword, slug, finalContent); // returns [content, imgCount]
        
        finalContent = processedImages[0];
        console.log("[" + new Date().toISOString() + "] PARSING DONE ...")
        // throw new Error('stop here');

        let updatedArt = await APICalls.updateArticle(article.id, { is_done: true, title_h1: meta.h1, title_seo: meta.title, description_seo: meta.description, content_body: finalContent, text_body: finalText, text_length: finalContent.length, imgsCount: processedImages[1] });
        console.log("[" + new Date().toISOString() + "] TRYING TO UPLOAD ...");

        //console.log(finalContent);
        let uploaded = await uploadArticle(task, updatedArt);

        if (!uploaded) {
            throw new Error('Upload error')
        } 

        console.log("[" + new Date().toISOString() + "] ARTICLE UPLOADED");

    }

    if (article.is_done && !article.is_uploaded) {
        let exists = await articleExists(task, slug); //returns id or false
        let uploaded = await uploadArticle(task, article, exists);
        if (!uploaded) {
            throw new Error('Upload error')
        } else {
            console.log("[" + new Date().toISOString() + "] ARTICLE UPLOADED ...");
        }
    }

    return true;
}


const startParsing = async () => {
    scheduleRestart();
    
    // find tasks to run
    let tasksToProcess = await APICalls.getTasks({ is_enabled: true, is_finished: false, is_processing: false });

    if (tasksToProcess === false) {
        console.log('### SERVER MIGHT BE DOWN...');
        return false;
    }

    if (tasksToProcess.length === 0) {
        console.log('### NOT FOUND TASKS TO RUN');
        return false;
    }
    console.log('### FOUND TASKS READY TO RUN: ' + tasksToProcess.length);

    for (const task of tasksToProcess) {
        let newWorker = await APICalls.createWorker({pid: process.env.pm_id, taskId: task.id})

        if (newWorker !== false) {
            IN_PROGRESS = true;
            TASK_ID = task.id;
            WORKER_ID = newWorker.id;

            console.log('TASK #' + task.id + ' STARTED, DOMAIN: ' + task.domain);
            await APICalls.updateTask(task.id, { is_started: true, is_processing: true });
        
            let articles = await APICalls.getArticles({ task: task.id, is_uploaded: false, is_skipped: false });
            // let dbCount = await APICalls.countArticles({ task: task.id, is_uploaded: false, is_skipped: false });
        
            if (articles.length !== 0) {
                try {
                    let finished = await parser(task, articles);
                    if (finished) {
                        console.log('TASK #' + task.id + ' BATCH COMPLETE, WAITING MORE, DOMAIN: ' + task.domain);
                        await APICalls.updateTask(task.id, { is_processing: false, is_finished: false });
                    } else {
                        console.log('TASK #' + task.id + ' ABORTED, DOMAIN: ' + task.domain);
                        await APICalls.updateTask(task.id, { is_processing: false, is_finished: false });
                    }
                } catch (err) {
                    console.log('TASK #' + task.id + ' FAILED, DOMAIN: ' + task.domain);
                    console.log(err);
                    await APICalls.updateTask(task.id, { is_processing: false });
                    await APICalls.deleteWorker(newWorker.id);
                    IN_PROGRESS = false;
                }
            } else {
                console.log('TASK #' + task.id + ' FINISHED, DOMAIN: ' + task.domain);
                await APICalls.updateTask(task.id, { is_processing: false, is_finished: true });
                await APICalls.deleteWorker(newWorker.id);
                IN_PROGRESS = false;
            }

            break;
        } else {
            console.log('TASK #' + task.id + ' OR WORKER # ' + process.env.pm_id + ' ALREADY IN PROGRESS, TRYING NEXT TASK')
        }
    }
    
}

/* CRON JOBS */

const scheduleRestart = () => {

    // Schedule restart 
    const kill = new CronJob('*/45 * * * *', async () => {
        await cleanUpServer();
        
    }, null, true);

    kill.start();
}

// Start parser with delay
if (process.env.pm_id !== undefined) { // pid exists only in cluster ??
    let pid = process.env.pm_id === '0' ? 0.2 : process.env.pm_id; // Make small delay even with pid = 0
    let timeout = parseInt(pid) * 1000 * 2; // Get PID (ex. 0 or 1 or 2 etc), * 1000 to convert to seconds, * 2 to double them just in case
    // Initial start
    setTimeout(() => {
        startParsing();
    }, timeout);

    // Schedule parser
    setTimeout(() => {
        const job = new CronJob('*/30 * * * * *', function () {
            if (!IN_PROGRESS) startParsing();
        }, null, true);

        job.start();
    }, timeout*2);
}

const cleanUpServer = async (options, exitCode) => {
    try {
        if (TASK_ID) {
            console.log('Updating in_process before KILL');
            await APICalls.updateTask(TASK_ID, {is_processing: false});
        }
        if (WORKER_ID) {
            console.log('Deleting worker before KILL');
            await APICalls.deleteWorker(WORKER_ID);
        }
        console.log('Killing job...');
    } catch (err) {
        console.log("Kill cronjob failed...");
        console.log(err);
    } finally {
        process.exit(0);
    }
}
[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, cleanUpServer.bind(null, eventType));
})

