const axios = require('axios');

const createWorker = async (query) => {
    try {
        let { data } = await axios.post('http://cherryvps.xyz:1337/workers/', query);
        console.log(data)
        return data;
    } catch (err) {
        console.log(err)
        console.log('API: Failed to request createWorkers');
        return false;
    }
}

createWorker({pid: 22, taskId: 222});