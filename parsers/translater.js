const puppeteer = require('puppeteer-core');
const fs = require('fs');

// chrome profile numbers (Profile 1)
const languages = {
    'en': 1,
    'es': 3,
    'dk': 99
}

const browserConnect = async (toLang) => {
    const browserURL = 'http://127.0.0.1:35432';
    let browser;
    try {
        browser = await puppeteer.connect({ browserURL });
    } catch (err) {
        console.log('PUPPETEER can\'t connect, launching');
        try {

            browser = await puppeteer.launch({
                timeout: 0,
                ignoreDefaultArgs: true,
                executablePath: '/usr/bin/google-chrome-unstable',
                args: [
                    '--remote-debugging-port=35432',
                    '--disable-gpu',
                    '--user-data-dir=/home/dev_acc/.config/google-chrome-unstable/Profile ' + languages[toLang]
                ],
            });
        } catch (err) {
            console.log(err);
            console.log('PUPPETEER can\'t launch, skipping');
        }
    } finally {
        return browser ? browser : false;
    }
}

module.exports = {
    translateTo: async (htmlText, toLang) => {
        const browser = await browserConnect(toLang);
        if (!browser) {
            throw new Error('Puppeteer problem');
        }

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
        await page.waitForTimeout(6000)

        // scroll page up to 3 times to translate if needed
        let repeatTimes = 2;
        let repeated = 0;
        // get translated text
        let hasRussianText = true;

        while (hasRussianText && repeatTimes > repeated) {
            let eval = await page.evaluate(() => {
                window.scrollTo(0,0);
            });
            // scroll to bottom to translate everything
            eval = await autoScroll(page);
            hasRussianText = await page.evaluate(() => {
                return document.documentElement.innerText.indexOf("е") !== -1;
            });
            repeated++;
        }

        if (!hasRussianText) {
            // get translated text
            let translated = await page.evaluate(() => {
                return document.querySelector('body').innerHTML.trim();
            });

            // fs.writeFileSync('html.txt', html);
            await page.close();
            return translated;
        }
        return false;
    }
}

async function autoScroll(page) {
    return await page.evaluate(async () => {
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