const fetch = require("node-fetch");
const xml2js = require('xml2js');

const buildAPIUri = (options) => {
    const API_URI = "https://yandex.ru/search/xml?user=marafon101kurs&key=03.442230827:3d63f2a53f26cf6587f12dd31469e01f";
    let query = '';
    for (let opt in options) {
        if (options.hasOwnProperty(opt)) {
            if (opt === 'docs_num') {
                query += `&groupby=attr=d.mode=deep.groups-on-page=${options[opt]}.docs-in-group=1`
            } else {
                query += `&${opt}=${options[opt]}`
            }
        }
    }
    // let encodedQuery = encodeURIComponent(query);

    return new URL(API_URI + query);
}

module.exports = {
    searchYA: async (keyword, task) => {
        let apiOptions = {
            'query': keyword,
            'l10n': 'ru',
            'sortby': 'rlv',
            'filter': 'moderate',
            'lr': 225,
            'docs_num': task.parser_type === 'download' ? 20 : 15 
        }
        let apiURL = buildAPIUri(apiOptions);

        // temp blacklist
        let combinedBlacklist = ['torrent', 'povar.ru', 'gidpodarit.ru','fb\\.ru','youtu', 'wiki', 'yandex', '\\.pdf', '\\.docx', '\\.rtf'];

        if (task.blacklist)
            combinedBlacklist = combinedBlacklist.concat(task.blacklist.trim().split(","));

        try {
            let request = await fetch(apiURL);
            request = await request.text();
            let parsedJSON = await xml2js.parseStringPromise(request, { trim: true });
            let urls = [];
            urls = iterate(parsedJSON, urls);

            if (urls.length === 0) {
                throw new Error("Urls not found")
            }

            urls = removeBlackListed(urls, combinedBlacklist);

            return urls;
        } catch (err) {
            console.log(err)
            return false;
        }
    }
}

// Iterate through json object/array to find all keys === "url" and return their values as an array
const iterate = (obj, urls) => {
    Object.keys(obj).forEach(key => {

        if (key === "url") {
            urls.push(obj[key][0]);
        }

        if (typeof obj[key] === 'object') {
            iterate(obj[key], urls);
        }
    })
    return urls;
}

const removeBlackListed = (urls, blacklist) => {
    let regex = new RegExp(blacklist.join('|'), 'gi');
    urls = urls.filter((url, i) => {
      return url.match(regex) === null;  
    })
    return urls;
}