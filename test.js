const CronJob = require('cron').CronJob;

const job = new CronJob('*/2 * * * * *', function () {
    setTimeout(() => {console.log('hello')}, 3);
}, null, true);

job.start();