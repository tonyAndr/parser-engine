const fetch = require("node-fetch");
const JSDOM = require('jsdom').JSDOM;
const createDOMPurify = require('dompurify');
const Readability = require('./Readability');
const lngDetector = new (require('languagedetect'));
const Entities = require('html-entities').AllHtmlEntities;

const getHTML = async (url) => {
    try {
        let html = await fetch(new URL(url), {
            follow: 3,         // maximum redirect count. 0 to not follow redirect
            timeout: 15000
        });
        if (!html.status || html.status !== 200) {
            throw new Error('Bad status');
        }
        let pageSrc = await html.textConverted();
        if (pageSrc.length > 500000) {
            throw new Error('Too large file');
        }
        return pageSrc;
    } catch (fetchError) {
        console.log("Fetch error, skip url: " + url);
        return false;
    }
}

const initialSanitizationAndRepairing = (DOMPurify, content, remove_links = true, remove_iframes = false) => {
    let forbidTags = ['style', 'svg', 'script'];
    let allowTags = ['meta', 'h1', 'noscript'];
    if (remove_links) {
        forbidTags.push('a');
    }
    if (!remove_iframes) {
        allowTags.push('iframe');
    }
    const clean = DOMPurify.sanitize(content, {
        WHOLE_DOCUMENT: true,
        FORBID_TAGS: forbidTags,
        FORBID_ATTR: ['style', 'id', 'srcset', 'sizes', 'data-flat-attr'],
        ADD_TAGS: allowTags,
        ADD_ATTR: ['content']
    });
    return clean;
}

const isGoodLanguage = (text) => {
    let docLang = lngDetector.detect(text);
    if (docLang.length === 0 || (docLang[0][0] !== 'russian' && docLang[0][0] !== 'bulgarian')) {
        return false;
    }
    return true;
}

const getMetaDescription = (document) => {
    let description = document.querySelector("meta[name='description']");
    if (description)
        description = description.content;
    else
        description = '';
    return description;
}

const removeTOC = (document) => {
    let tocs = document.querySelectorAll("*[class*='toc']");
    tocs.forEach((toc, i) => {
        tocs[i].remove();
    })
    tocs = document.querySelectorAll("*[id*='toc']");
    tocs.forEach((toc, i) => {
        tocs[i].remove();
    })
}

const replaceOLwithUL = (document) => {
    let ols = document.querySelectorAll("ol");
    ols.forEach((ol, i) => {
        ols[i].outerHTML = "<ul>" + ol.innerHTML + "</ul>";
    })
}

const extractH1 = (document) => {
    let h1 = document.getElementsByTagName("h1")[0];
    // console.log(h1.outerHTML)
    if (h1)
        h1 = h1.textContent;
    else
        h1 = '';
    return h1;
}

const extractReadableArticle = (document, DOMPurify) => {
    let reader = new Readability(document);
    let article = reader.parse();

    if (article === null || article.content === null || article.content.length < 3000 || article.content.length > 35000) {
        return false;
    }

    // skip copypast (Источник*)
    if (isCopyPast(article)) {
        return false;
    }

    // remove spec symbols
    let cleanedBody = article.content.replace(/[\r\n\t]/g, '');

    cleanedBody = DOMPurify.sanitize(cleanedBody, {
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['width', 'height'],
        FORBID_TAGS: ['div', 'article', 'section', 'header', 'figcaption', 'figure', 'span'],
        FORBID_ATTR: ['data-src', 'data-lazy-src', 'loading', 'data-lazy-srcset', 'aria-describedby']
    });

    // Remove empty nodes
    DOMPurify.addHook('afterSanitizeElements', function (node) {
        // convert unsupported tags
        let supported = ['a', 'b', 'blockquote', 'body', 'br', 'caption', 'code', 'col', 'colgroup', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img', 'ins', 'li', 'ul', 'ol', 'main', 'noscript', 'p', 'q', 'section', 'span', 'strong', 'sub', 'table', 'tbody', 'thead', 'th', 'td', 'tr', 'tfoot', 'hgroup', 'dd', 'dl'];
        let toRemove = ['form', 'input', 'label', 'meter', 'nav', 'option', 'select', 'source', 'video', 'cite', 'time', 'canvas', 'textarea', 'progress', 'output', 'meter'];
        let toSpan = ['font', 'mark', 's', 'strike', 'u', 'small'];

        if (node.tagName) {

            if (toRemove.includes(node.tagName.toLowerCase())) {
                node.remove();
                return null;
            }

            if (toSpan.includes(node.tagName.toLowerCase())) {
                node.outerHTML = '<span>' + node.innerHTML + '</span>';
            }

            if (!supported.includes(node.tagName.toLowerCase())) {
                if (node.innerHTML.trim().length > 0) {
                    node.outerHTML = '<p>' + node.innerHTML + '</p>';
                } else {
                    node.remove();
                    return null;
                }
            }


            if ((node.tagName === "H2" || node.tagName === "P") && node.innerHTML.trim().length === 0) {
                node.remove();
            }
        }
    });

    // remove noscript tags with content (usually contain repeating imgs)
    cleanedBody = DOMPurify.sanitize(cleanedBody, {
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['width', 'height'],
        FORBID_TAGS: ['noscript'],
        KEEP_CONTENT: false
    });

    // replace html encoded spaces
    cleanedBody = cleanedBody.replace(/&nbsp;/g, ' ');

    // remove multiple spaces
    cleanedBody = cleanedBody.replace(/\s+/g, ' ');

    // remove shortcodes
    cleanedBody = cleanedBody.replace(/\[.+?\]/g, '');

    // decode html entities
    const entities = new Entities();
    cleanedBody = entities.decode(cleanedBody);

    return {
        title: article.title,
        artLen: article.content.length,
        cleanedBody
    }
}

const isCopyPast = (article) => {
    let copypast = article.content.match(/источник/ig);
    if (copypast && copypast.length > 2) {
        return true;
    }
    return false;
}

const keepDocumentLinksOnly = (document) => {
    let allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'rtf', 'pptx', 'ppt', 'odt', 'txt'];

    let links = document.querySelectorAll('a');
    for (let a of links) {
        let temp = a.getAttribute('href');
        if (!temp) {
            a.outerHTML = a.innerHTML;
        } else {
            temp = temp.split('.');
            if (!allowedExtensions.includes(temp[temp.length-1].toLowerCase())) {
                a.outerHTML = a.innerHTML;
            }
        }
    }
}

const prepareDonorBlocks = async (url, task) => {
    let dom = new JSDOM('');
    let window = dom.window;
    let DOMPurify = createDOMPurify(window);

    let pageSrc = await getHTML(url);
    if (!pageSrc) {
        return false;
    }

    const removeIframes = task.translateTo && task.translateTo !== 'no' ? true : false; 
    // Sanitize raw html before article extraction with Readability
    const clean = initialSanitizationAndRepairing(DOMPurify, pageSrc, task.remove_links, removeIframes);

    dom = new JSDOM(clean, {url});
    let document = dom.window.document;

    // check lang
    if (!isGoodLanguage(document.querySelector('body').textContent)) {
        return false;
    }

    let description = getMetaDescription(document);

    // remove toc
    removeTOC(document);

    // replace ol with ul
    replaceOLwithUL(document);

    // keep only docs links
    if (!task.remove_links) {
        keepDocumentLinksOnly(document);
    }

    let h1 = extractH1(document);
    
    let extracted = extractReadableArticle(document, DOMPurify);
    if (!extracted) {
        return false;
    }
    let { title, artLen, cleanedBody } = extracted;
    
    // check headers
    let hasH2 = cleanedBody.indexOf("<h2") > -1;
    let hasIntro = cleanedBody.indexOf("<h2") > 0;

    // split into blocks
    cleanedBody = cleanedBody.replace(/<h2/g, '[BLOCK_BRAKER]<h2').split("[BLOCK_BRAKER]");

    let contentBlocks = {
        intro: hasIntro ? cleanedBody[0] : '',
        blocks: hasH2 ? cleanedBody.slice(1) : cleanedBody, // slice to remove intro
        hasH2
    }
 
    let articleObject = {
            title: title,
            description,
            h1,
            contentBlocks,
            textLength: artLen
    };
    
    // Nullify for GC (pointless?)
    document = null;
    window.close();
    window = null;
    DOMPurify = null;
    dom = null;
    reader = null;
    article = null;

    return articleObject;
}

const prepareDonorDownload = async (url) => {
    let dom = new JSDOM('');
    let window = dom.window;
    let DOMPurify = createDOMPurify(window);

    let pageSrc = await getHTML(url);
    if (!pageSrc) {
        return false;
    }

    // Sanitize raw html before article extraction with Readability
    const clean = initialSanitizationAndRepairing(DOMPurify, pageSrc);

    dom = new JSDOM(clean, { url });
    let document = dom.window.document;

    // check lang
    if (!isGoodLanguage(document.querySelector('body').textContent)) {
        return false;
    }

    let description = getMetaDescription(document);

    // remove toc
    removeTOC(document);

    // // replace ol with ul
    // replaceOLwithUL(document);

    let h1 = extractH1(document);

    let extracted = extractReadableArticle(document, DOMPurify);
    if (!extracted) {
        return false;
    }
    let { title, artLen, cleanedBody } = extracted;

    // // check headers
    // let hasH2 = cleanedBody.indexOf("<h2") > -1;
    // let hasIntro = cleanedBody.indexOf("<h2") > 0;

    // // split into blocks
    // cleanedBody = cleanedBody.replace(/<h2/g, '[BLOCK_BRAKER]<h2').split("[BLOCK_BRAKER]");

    // let contentBlocks = {
    //     intro: hasIntro ? cleanedBody[0] : '',
    //     blocks: hasH2 ? cleanedBody.slice(1) : cleanedBody, // slice to remove intro
    //     hasH2
    // }

    // if (contentBlocks !== undefined) {
    //     return false;
    // }

    let articleObject = {
        title: title,
        description,
        h1,
        content: cleanedBody,
        textLength: artLen
    };

    // Nullify for GC (pointless?)
    document = null;
    window.close();
    window = null;
    DOMPurify = null;
    dom = null;
    reader = null;
    article = null;

    return articleObject;
}

module.exports = {
    getPreparedDonors: async (task, urls) => {
        let parsedContent = {};

        try {
            for (let i = 0; i < urls.length; i++) {
                if (task.parser_type && task.parser_type === 'download') {
                    let prepared = await prepareDonorDownload(urls[i]);
                    if (!prepared) {
                        continue;
                    }
                    parsedContent[urls[i]] = prepared;
                } else {
                    let prepared = await prepareDonorBlocks(urls[i], task);
                    if (!prepared) {
                        continue;
                    }
                    parsedContent[urls[i]] = prepared;
                }
            }
            
        } catch (err) {
            console.log(err);
        } finally {
            if (Object.keys(parsedContent).length === 0) {
                return false;
            }
            return parsedContent;
        }

    }
}
