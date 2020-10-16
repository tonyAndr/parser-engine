const { searchYA } = require('./parsers/search/yandex');
const { getPreparedDonors } = require('./parsers/get_html/get');
const { cleanGarbage, removeHtmlTags, insertMoreTag } = require('./parsers/dom_utils');
const { processBlocks } = require('./parsers/article_structure/process_blocks');
const { imgProcessing } = require('./parsers/post_processing');
const { getMeta } = require('./parsers/meta');
const cyrillicToTranslit = require('cyrillic-to-translit-js');
const natural = require('natural');
const { uploadArticle, articleExists } = require('./parsers/wp_upload');
const { getTasks, getArticles, countArticles, updateTask, updateArticle } = require('./apiCalls');
const { translateTo } = require('./parsers/translater');
const { processDownloadStructure } = require('./parsers/article_structure/download');
const CronJob = require('cron').CronJob;
const translate = require('@vitalets/google-translate-api');

const parser = async (task, articles) => {
    try {

        for (let i = 0; i < articles.length; i++) {

            const article = articles[i];
            let keyword = article.keyword.trim();

            // no keyword || category undefined || exceed tries
            if (!keyword || !article.category.trim() || article.tries >= 2) {
                await updateArticle(article.id, { is_skipped: true });
                continue;
            }

            if (article.is_skipped) {
                continue;
            }

            let domain = task.domain;
            // create slug
            const tokenizer = new natural.WordTokenizer();
            let keyword_translated = await translate(keyword, { to: 'es' });
            console.log(keyword_translated);
            keyword_translated = keyword_translated.text;

            const slug = tokenizer
                .tokenize(keyword_translated) //  tokenizing
                .slice(0, 8) // take maximum 9 words
                .join('-') // slug-like glue
                .toLowerCase();

            if (!article.is_done && article.tries < 2) {
                let timer = process.hrtime();
                // check if already exists on the website
                let exists = await articleExists(task, slug); //returns id or false
                if (exists) {
                    await updateArticle(article.id, { slug, wp_id: exists, is_done: true, is_uploaded: true });
                    continue;
                }

                await updateArticle(article.id, { slug });

                console.log("[" + new Date().toISOString() + "] PARSING STARTED, KW: [" + keyword + "] ...")
                let urls = await searchYA(keyword, task);
                // console.log(urls)

                if (!urls) {
                    throw new Error('Yandex XML returned error');
                }

                console.log("[" + new Date().toISOString() + "] GETTING HTML ...")
                let parsedContent = await getPreparedDonors(task, urls);
                if (parsedContent === false) {
                    await updateArticle(article.id, { tries: article.tries + 1 });
                    throw new Error('Couldn\'t get HTML, no donors to work with');
                }
                
                console.log("[" + new Date().toISOString() + "] PROCESSING TEXTS ...")
                let processedContent = false;
                if (!task.parser_type || task.parser_type === 'standard') {
                    processedContent = processBlocks(parsedContent);
                    if (processedContent === false) {
                        await updateArticle(article.id, { tries: article.tries + 1 });
                        throw new Error('Probably failed to get Intro text or no headers found, skipping');
                    }
                }

                if (task.parser_type && task.parser_type === 'download') {
                    processedContent = processDownloadStructure(parsedContent);
                    if (processedContent === false) {
                        await updateArticle(article.id, { tries: article.tries + 1 });
                        throw new Error('Failed to fetch/process articles');
                    }
                }
                
                let [finalContent, usedDonors] = processedContent;

                if (usedDonors.length < 3) {
                    await updateArticle(article.id, { tries: article.tries + 1 });
                    throw new Error('Not enough donors were used, skipped');
                }
                finalContent = cleanGarbage(finalContent);
                let finalText = removeHtmlTags(finalContent);

                // add more tag
                finalContent = insertMoreTag(finalContent);

                if (finalText.length < 3000) {
                    await updateArticle(article.id, { tries: article.tries + 1 });
                    throw new Error('Not enough text length, skipped');
                }
                
                let meta = getMeta(keyword_translated, parsedContent, finalText);
                meta.title = await translate(meta.title, { to: 'es' });
                meta.description = await translate(meta.description, { to: 'es' });

                if (task.translateTo && task.translateTo !== 'no') {
                    console.log("[" + new Date().toISOString() + "] TRANSLATING ...")
                    finalContent = await translateTo(finalContent, task.translateTo);
                }
                
                console.log("[" + new Date().toISOString() + "] PROCESSING IMGS ...")
                let processedImages = await imgProcessing(domain, keyword_translated, slug, finalContent); // returns [content, imgCount]
                
                finalContent = processedImages[0];
                console.log("[" + new Date().toISOString() + "] PARSING DONE ...")
                // throw new Error('stop here');

                let updatedArt = await updateArticle(article.id, { is_done: true, title_h1: meta.h1, title_seo: meta.title.text, description_seo: meta.description.text, content_body: finalContent, text_body: finalText, text_length: finalContent.length, imgsCount: processedImages[1] });
                console.log("[" + new Date().toISOString() + "] TRYING TO UPLOAD ...");

                //console.log(finalContent);
                let uploaded = await uploadArticle(task, updatedArt);

                if (!uploaded) {
                    throw new Error('Upload error')
                } 

                console.log("[" + new Date().toISOString() + "] ARTICLE UPLOADED");
                let elapsed = process.hrtime(timer)[0];
                console.log('TIME: ' + elapsed + ' seconds.');
                continue;
            }

            if (article.is_done && !article.is_uploaded) {
                let exists = await articleExists(task, slug); //returns id or false
                let uploaded = await uploadArticle(task, article, exists);
                if (!uploaded) {
                    await updateArticle(article.id, { tries: article.tries + 1 });
                    throw new Error('Upload error')
                } else {
                    console.log("[" + new Date().toISOString() + "] ARTICLE UPLOADED ...");
                }
            }

            if (article.is_done && article.is_uploaded) {
                continue;
            }


        }
        return true;
    } catch (err) {
        console.log(err)
        return false;
    }
}


const startParsing = async () => {
    const MAX_TASKS_RUNNING = 2;
    // check what is running
    // let tasksInProgress = await getTasks({ is_processing: true });

    // if (tasksInProgress.length > MAX_TASKS_RUNNING - 1) {
    //     console.log('### TASKS IN PROGRESS: ' + tasksInProgress.length);
    //     return false;
    // }
    // find tasks to run
    let tasksToProcess = await getTasks({ id: 33 });

    if (tasksToProcess === false) {
        console.log('### SERVER MIGHT BE DOWN...');
        return false;
    }

    if (tasksToProcess.length === 0) {
        console.log('### NOT FOUND TASKS TO RUN');
        return false;
    }
    console.log('### FOUND TASKS READY TO RUN: ' + tasksToProcess.length);

    let forLimit = MAX_TASKS_RUNNING > tasksToProcess.length ? tasksToProcess.length : MAX_TASKS_RUNNING;

    for (let i = 0; i < forLimit; i++) {
        const task = tasksToProcess[i];
        console.log('TASK #' + task.id + ' STARTED, DOMAIN: ' + task.domain);
        await updateTask(task.id, { is_started: true, is_processing: true });

        let articles = await getArticles({ task: task.id, is_uploaded: false, is_skipped: false });
        let dbCount = await countArticles({ task: task.id, is_uploaded: false, is_skipped: false });
        if (articles.length !== 0) {
            parser(task, articles).then(finished => {
                if (finished && articles.length === dbCount) {
                    console.log('TASK #' + task.id + ' FINISHED, DOMAIN: ' + task.domain);
                    updateTask(task.id, { is_processing: false, is_finished: true });
                } else if (finished && articles.length !== dbCount) {
                    console.log('TASK #' + task.id + ' BATCH COMPLETE, WAITING MORE, DOMAIN: ' + task.domain);
                    updateTask(task.id, { is_processing: false, is_finished: false });
                } else {
                    console.log('TASK #' + task.id + ' ABORTED, DOMAIN: ' + task.domain);
                    updateTask(task.id, { is_processing: false, is_finished: false });
                }
            }).catch(err => {
                console.log('TASK #' + task.id + ' FAILED, DOMAIN: ' + task.domain);
                console.log(err);
                updateTask(task.id, { is_processing: false });
            })
        } else {
            console.log('TASK #' + task.id + ' FINISHED, DOMAIN: ' + task.domain);
            await updateTask(task.id, { is_processing: false, is_finished: true });
        }
    }
}
// startParsing();

/* CRON JOBS */

const startJobsScheduler = () => {
    // Schedule parser
    const job = new CronJob('*/30 * * * * *', function () {
        startParsing();
    }, null, true);

    job.start();

    // Schedule restart 
    const kill = new CronJob('10 0 */1 * * *', async () => {
        try {
            let inProgress = await getTasks({ is_processing: true });
            for (let i = 0; i < inProgress.length; i++) {
                const element = inProgress[i];
                let updated = await updateTask(element.id, {is_processing: false});
                console.log('Updating in_process before KILL');
            }
            console.log('Killing job...');
            process.exit(0);
        } catch (err) {
            console.log("Kill cronjob failed...");
            console.log(err);
        }
    }, null, true);

     kill.start();
}
//startJobsScheduler();

startParsing();

