const natural = require('natural');
natural.PorterStemmerRu.attach();
const wuzzy = require('wuzzy');
const JSDOM = require('jsdom').JSDOM;

let commonlyUsedTokens = {};
let groupsCount = 0;
let introText = '';
let introIndexKey;

const extractHeaders = (parsedContent) => {
    let headersArray = [];
    let introScore = -10;

    for (let key in parsedContent) {
        if (parsedContent.hasOwnProperty(key)) {
            let article = parsedContent[key];

            // choose intro
            let score = htmlComplexityScore(article.contentBlocks.intro, true);
            // console.log(key)
            // console.log(article.contentBlocks.intro)
            // console.log(score)
            if (score > introScore) {
                introIndexKey = key;
                introScore = score;
            }

            // end choose intro

            // extracting headers
            if (article.contentBlocks.hasH2) {
                article.contentBlocks.blocks.forEach((block, index) => {

                    let match = block.match(/<h2[^>]*>(.+?)<\/h2>/iu);
                    // block is "readmore" links or similar
                    
                    if (match !== null) {                        
                        let h2Text = match[1].trim();
                        let musor = null !== h2Text.match(/Комментарии|Коментарии|Комментирова|Отзыв|Обсужден|Похожие темы|^Читать|Будет интересно|^Будет полезно|Читайте|^Содержание|Оглавлен|Узнайте|Рекомендуем|Еще по теме|Смотрите так|Похожие материалы|Похожие статьи|Похожие записи|Что еще почитать|Вам будут|Вам будет|Будет интересно|Будут интересны|Интересные статьи|Интересные материалы|Где купить подарки|Остались вопросы|Новост|Статьи для вас|в тему|Самое читаемое/gi); 
                        if (!musor && !isHeadersList(block)) {
                            headersArray.push({
                                url: key,
                                h2: h2Text,
                                tokens: h2Text.tokenizeAndStem(),
                                priority: index
                            })
        
                            if (index + 1 > groupsCount) {
                                groupsCount = index + 1;
                            }
                        }
                    }
                })
            }
        }
    }
    // console.log("chosen key: " + introIndexKey)
    if (!introIndexKey || parsedContent[introIndexKey] === undefined || headersArray.length === 0) {
        return false;
    }
    // console.log('== debug ==')
    // console.log(introIndexKey)
    // console.log(parsedContent[introIndexKey])
    // console.log('== debug ==')
    introText = parsedContent[introIndexKey].contentBlocks.intro;

    return headersArray;
}

// check if block looks like a list of links with many headers and not much text
const isHeadersList = (block) => {
    let h_match = block.match(/<(h3|h4|h5|h6)/ig);
    let img_match = block.match(/<img/ig);
    if (h_match !== null && h_match.length >= 5) {
        if (block.length < 2000 && (img_match === null || img_match.length === 1))
            return true;
    }
    return false;
}

// removes short tokens (<=2 chars) and counts commonly used words
const cleanTokens = (headersArray) => {
    headersArray.forEach(header => {
        header.tokens.filter(token => {
            if (token.length > 2) {
                commonlyUsedTokens[token] = commonlyUsedTokens.hasOwnProperty(token) ? commonlyUsedTokens[token] + 1 : 1;
                return true;
            } else {
                return false;
            }
        })
    })
    return headersArray;
}

// creates array from object, returns only 3 overused tokens
const sortCommonTokens = () => {
    let keysSorted = Object.keys(commonlyUsedTokens).sort(function (a, b) { return commonlyUsedTokens[b] - commonlyUsedTokens[a] })
    commonlyUsedTokens = keysSorted.slice(0, 3);
}


const createGroupsComplicated = (headersArray) => {

    let pairedIndices = [];
    headersArray.forEach((hx, ix) => {
        let similarIndex = [];
        // let maxScore = 0;
        headersArray.forEach((hy, iy) => {
            if (hx.url !== hy.url) {
                let score = getSimilarityScore(hx.tokens, hy.tokens);
                if (score > 0.60 || hx.h2.toLowerCase().trim() === hy.h2.toLowerCase().trim()) {
                    // maxScore = score;
                    similarIndex.push(iy);
                }
            }
        })

        if (similarIndex.length > 0) {
            pairedIndices.push([ix, ...similarIndex]);
        } else {
            pairedIndices.push([ix])
        }
    })
    // console.log(pairedIndices)
    let groupedIndices = createGroupsIndices(pairedIndices);

    return groupedIndices;
}

// unite paired indices to groups using intersection and union
const createGroupsIndices = (pairedIndices) => {
    let unitedIndices = [];
    for (let xi = 0; xi < pairedIndices.length; xi++) {
        const xe = pairedIndices[xi];
        if (unitedIndices.includes(xi))
            continue;
        for (let yi = 0; yi < pairedIndices.length; yi++) {
            const ye = pairedIndices[yi];

            if (xi !== yi) {
                let intersec = xe.filter(x => ye.includes(x));
                if (intersec.length > 0) {
                    pairedIndices[xi] = arrayUnion(pairedIndices[xi], pairedIndices[yi]);
                    unitedIndices.push(yi)
                }
            }
        }
    }
    let groupedIndices = pairedIndices.filter((el, i) => {
        return !unitedIndices.includes(i);
    })
    return groupedIndices;

}

// array union 
const arrayUnion = (arrA, arrB) => {
    let union = [...new Set([...arrA, ...arrB])];
    return union;
}

const getSimilarityScore = (a, b) => {

    // remove overused tokens - todo: move to settings
    // a = a.filter(el => {
    //     return !commonlyUsedTokens.includes(el);
    // })
    // b = b.filter(el => {
    //     return !commonlyUsedTokens.includes(el);
    // })
    return wuzzy.jarowinkler(a, b);
}

const DEVshowGroupedHeaders = (headersArray, groupedIndices) => {
    console.log(groupedIndices.map(pair => {
        return pair.map(index => {
            return headersArray[index].h2;
        })
    }))
}

/* 
    Building the article

*/



const optimizeGroups = (parsedContent, headersArray, groupedIndices) => {

    groupedIndices.forEach((group, gr_ind) => {
        if (group.length >= 1) {
            let goodHeaderIndex; // which we choose from the group
            let maxCoefficient = 0;
            group.forEach(index => {
                let url = headersArray[index].url;
                let blockIndex = headersArray[index].priority;
                let blockContent = parsedContent[url].contentBlocks.blocks[blockIndex];

                // TODO: check parametres and calc coeff
                let coef = htmlComplexityScore(blockContent);

                if (coef > maxCoefficient) {
                    maxCoefficient = coef;
                    goodHeaderIndex = index;
                }
                // END of checking
            })

            // remove block which we don't need
            groupedIndices[gr_ind] = group.filter(index => (index === goodHeaderIndex))
        }
    })
    return [].concat(...groupedIndices);
}

// calc blocks coefficients to choose the best
const htmlComplexityScore = (block, isIntro = false) => {
    // img, tag variety, words variety, has urls, h2 numerical first char
    const COEF_IMG = isIntro ? 0 : 1;
    const COEF_GIFS = 3;
    const COEF_GARBAGE = 3;
    const COEF_HAS_LINKS = 2;
    const COEF_TAGS = isIntro ? 0 : 0.5;
    const COEF_H2_DIGIT = 1;
    const LENGTH_MIN = isIntro ? 200 : 500;
    const LENGTH_MAX = isIntro ? 1200 : 5000;
    const COEF_LENGTH_MAX = isIntro ? 5 : 1;
    const COEF_CONCLUSION = isIntro ? 99 : 5;
    const COEF_TOC = isIntro ? 99 : 5;

    let coef = 0;

    if (block.length < 200 || block.length > 10000) {
        return -100;
    }

    // has source links
    // if (block.match(/\.(ru|com|net|рф|club|io|info|org)/giu)) {
    //     coef = coef - COEF_HAS_LINKS;
    // }

    // has images
    if (block.match(/<img/giu)) {
        coef = coef + COEF_IMG;
    }

    // has gifs
    if (block.match(/\.gif/giu)) {
        coef = coef - COEF_GIFS;
    }

    // has lists, tables, etc
    let elements = block.match(/<(ol|ul|table|strong)/giu)
    if (elements) {
        coef = coef + COEF_TAGS * elements.length;
    }

    // header starts with digit
    if (block.match(/<h2[^>]*>\s*(\d|<).+?<\/h2>/gui)) {
        coef = coef - COEF_H2_DIGIT;

    }

    // text length small
    if (block.length < LENGTH_MIN) {
        coef = coef - 1;
    }

    // text length long
    if (block.length > LENGTH_MAX) {
        coef = coef - COEF_LENGTH_MAX;
    }

    // Conclusion block 
    if (block.match(/Заключение|Заключении|Вывод|Итог|Подведем итог/gui)) {
        coef = coef - COEF_CONCLUSION;
    }

    // has TOC 
    if (block.match(/Содержание|Оглавление/gu)) {
        coef = coef - COEF_TOC;
    }

    return coef;
}



const buildContentBody = (parsedContent, headersArray, optimizedIndices) => {
    let sortedBlocks = [];
    let usedDonors = [];
    // adding blocks using priority to position correctly
    optimizedIndices.forEach((h_index, i) => {
        let url = headersArray[h_index].url;
        let blockIndex = headersArray[h_index].priority;
        let blockContent = parsedContent[url].contentBlocks.blocks[blockIndex];
        let addToArticle = false;

        if (blockContent.match(/Список источников/gu)) {
            // src list to the end
            blockIndex = 99;
            addToArticle = true;
        } else if (!blockContent.match(/Заключение|В качестве заключения|Заключении|Вывод|Итог|Подведем итог/gu)) {
            // add block to its pos, and dont show conclusion at all
            addToArticle = true;
        }
        if (addToArticle) {
            usedDonors.push(url);
            sortedBlocks.splice(blockIndex, 0, "<div class='content-block-start'><!-- START BLOCK, SRC: [" + url + "] --></div>" + blockContent + "<div class='content-block-end'><!-- END BLOCK, SRC: [" + url + "] --></div>");
        }
    });

    usedDonors = [...new Set(usedDonors)];

    // adding excerpt
    sortedBlocks.splice(0, 0, "<div class='content-block-start'><!-- START INTRO, SRC: [" + introIndexKey + "] --></div>" + introText + "<div class='content-block-end'><!-- END INTRO, SRC: [" + introIndexKey + "] --></div>");

    return [sortedBlocks, usedDonors];
}



module.exports = {
    processBlocks: (parsedContent) => {
        let headersArray = extractHeaders(parsedContent);
        if (headersArray === false) {
            return false;
        }
        headersArray = cleanTokens(headersArray);
        sortCommonTokens();
        // createGroups(headersArray);
        let groupedIndices = createGroupsComplicated(headersArray);
        // DEVshowGroupedHeaders(headersArray, groupedIndices);
        let optimizedIndices = optimizeGroups(parsedContent, headersArray, groupedIndices);
        let [sortedContentBlocks, usedDonors] = buildContentBody(parsedContent, headersArray, optimizedIndices);

        let dirtyFinalHTML = sortedContentBlocks.join(' ');

        // finalText = removeGarbageDOM(finalText);
        // console.log(finalText);
        console.log("HTML length: " + dirtyFinalHTML.length);
        console.log("Initial blocks count: " + headersArray.length);
        console.log("Final blocks count: " + sortedContentBlocks.length);
        return [dirtyFinalHTML, usedDonors];
    },

}