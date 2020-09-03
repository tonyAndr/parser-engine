const fetch = require("node-fetch");
const JSDOM = require('jsdom').JSDOM;
const createDOMPurify = require('dompurify');
const Readability = require('./Readability');
const lngDetector = new (require('languagedetect'));
const Entities = require('html-entities').AllHtmlEntities;

module.exports = {
    getHtml: async (urls) => {
        let parsedContent = {};
        try {
            for (let i = 0; i < urls.length; i++) {
                let pageSrc = '';
                try {
                    let html = await fetch(new URL(urls[i]));
                    if (!html.status || html.status !== 200) {
                        throw new Error('Bad status');
                    }
                    pageSrc = await html.textConverted();
                } catch(fetchError) {
                    console.log("Fetch error, skip url: "+urls[i]);
                    continue;
                }
            
                const window = new JSDOM('').window;
                const DOMPurify = createDOMPurify(window);

                const clean = DOMPurify.sanitize(pageSrc, {
                    WHOLE_DOCUMENT: true,
                    FORBID_TAGS: ['style', 'svg', 'a'],
                    FORBID_ATTR: ['style', 'id', 'srcset', 'sizes', 'data-flat-attr'],
                    ADD_TAGS: ['meta', 'h1', 'noscript', 'iframe'],
                    ADD_ATTR: [ 'content']
                });

                // console.log(clean)

                let dom = new JSDOM(clean, {
                    url: urls[i],
                });
                let document = dom.window.document;

                // check lang
                let docLang = lngDetector.detect(document.querySelector('body').textContent);
                if (docLang.length === 0 || (docLang[0][0] !== 'russian' && docLang[0][0] !== 'bulgarian' )) {
                    continue;
                }

                let description = document.querySelector("meta[name='description']");
                if (description)
                    description = description.content;
                else 
                    description = '';

                // remove toc
                let tocs = document.querySelectorAll("*[class*='toc']");
                tocs.forEach((toc, i) => {
                    tocs[i].remove();
                })
                tocs = document.querySelectorAll("*[id*='toc']");
                tocs.forEach((toc, i) => {
                    tocs[i].remove();
                })

                // replace ol with ul
                let ols = document.querySelectorAll("ol");
                ols.forEach((ol, i) => {
                    ols[i].outerHTML = "<ul>" + ol.innerHTML + "</ul>";
                })

                let h1 = document.getElementsByTagName("h1")[0];
                // console.log(h1.outerHTML)
                if (h1)
                    h1 = h1.textContent;
                else
                    h1 = '';

                let reader = new Readability(document);
                let article = reader.parse();

                if (article === null || article.content === null || article.content.length < 3000 || article.content.length > 35000) {
                    continue;
                }

                // skip copypast (Источник*)
                let copypast = article.content.match(/источник/ig);
                if (copypast && copypast.length > 2) {
                    continue;
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
                    // Set text node content to uppercase
                    if ((node.tagName === "H2" || node.tagName === "P") && node.innerHTML.trim().length === 0) {
                        node.remove();
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

                // check headers
                let hasH2 = cleanedBody.indexOf("<h2") > -1;
                let hasIntro = cleanedBody.indexOf("<h2") > 0;

                // decode html entities
                const entities = new Entities();
                cleanedBody = entities.decode(cleanedBody);

                // split into blocks
                cleanedBody = cleanedBody.replace(/<h2/g, '[BLOCK_BRAKER]<h2').split("[BLOCK_BRAKER]");

                let contentBlocks = {
                    intro: hasIntro ? cleanedBody[0] : '',
                    blocks: hasH2 ? cleanedBody.slice(1) : cleanedBody, // slice to remove intro
                    hasH2
                }

                if (contentBlocks !== undefined) {
                    parsedContent[urls[i]] = {
                        title: article.title,
                        description,
                        h1,
                        contentBlocks,
                        textLength: article.content.length
                    };
                } 
            }
            return parsedContent;
        } catch (err) {
            console.log(err)
        }

    }
}
