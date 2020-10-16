const puppeteer = require('puppeteer-core');
const fs = require('fs');

const languages = {
    'en': 1,
    'es': 3,
    'dk': 99
}

module.exports = {
    translateTo: async (htmlText, toLang) => {
        const browser = await puppeteer.launch({
            timeout: 0,
            ignoreDefaultArgs: true,
            executablePath: '/usr/bin/google-chrome-unstable',
            args: [
                '--disable-gpu',
                '--user-data-dir=/home/dev_acc/.config/google-chrome-unstable/Profile ' + languages[toLang]
            ],
        });
        const page = await browser.newPage();
        
        // load any page matching source language
        await page.goto('https://bash.im', {
            waitUntil: 'networkidle2',
            timeout: 3000000
        });
        // setting our content to translate 
        await page.setContent(htmlText);

        // adjust screen size
        await page.setViewport({
            width: 1000,
            height: 640
        });
        // wait til translater loaded
        await page.waitFor(5000)

        // scroll to bottom to translate everything
        await autoScroll(page);

        // get translated text
        let translated = await page.evaluate(() => {
            return document.querySelector('body').textContent.trim();
        });

        // fs.writeFileSync('html.txt', html);
        await browser.close();
        return translated;
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}