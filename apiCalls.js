const axios = require('axios');
const qs = require('qs');

module.exports = {
    // get tasks
    getTasks: async (query = false) => {
        try {
            let { data } = await axios.get('http://cherryvps.xyz:1337/getTasks');
            if (!query) return data;
            else return data.filter(task => {
                let is_good = true;
                for(const prop in query) {
                    if (query.hasOwnProperty(prop)) {
                        if (task[prop] !== query[prop]) {
                            is_good = false;
                        }
                    }
                }
                return is_good;
            });
        } catch (err) {
            console.log('API: Failed to request getTasks');
            return false;
        }
    },
    getArticles: async (query) => {
        try {
            let { data } = await axios.get('http://cherryvps.xyz:1337/articles?'+qs.stringify(query));
            return data;
        } catch (err) {
            console.log('API: Failed to request getTasks');
            return false;
        }
    },
    countArticles: async (query) => {
        try {
            let { data } = await axios.get('http://cherryvps.xyz:1337/articles/count?'+qs.stringify(query));
            return data;
        } catch (err) {
            console.log('API: Failed to request getTasks');
            return false;
        }
    },
    //update task
    updateTask: async (id, query) => {
        try {
            let { data } = await axios.put('http://cherryvps.xyz:1337/tasks/' + id, query);
            return data;
        } catch (err) {
            console.log('API: Failed to request updateTask');
            return false;
        }
    },
    updateArticle: async (id, query) => {
        try {
            let { data } = await axios.put('http://cherryvps.xyz:1337/articles/' + id, query);
            return data;
        } catch (err) {
            console.log(err)
            console.log('API: Failed to request updateArticle');
            return false;
        }
    },

    // workers temporary records, avoiding parsing of the same task several times
    createWorker: async (query) => {
        try {
            let { data } = await axios.post('http://cherryvps.xyz:1337/workers/', query);
            return data;
        } catch (err) {
            // console.log(err)
            console.log('API: Failed to request createWorkers');
            return false;
        }
    }, 
    updateWorker: async (pid, query) => {
        try {
            let { data } = await axios.put('http://cherryvps.xyz:1337/workers/' + pid, query);
            return data;
        } catch (err) {
            console.log(err)
            console.log('API: Failed to request updateWorkers');
            return false;
        }
    }, 
    deleteWorker: async (pid) => {
        try {
            let { data } = await axios.delete('http://cherryvps.xyz:1337/workers/' + pid);
            return data;
        } catch (err) {
            console.log(err)
            console.log('API: Failed to request deleteWorkers');
            return false;
        }
    },
    getWorkers: async (query = false) => {
        try {
            let { data } = await axios.get('http://cherryvps.xyz:1337/getWorkers');
            if (!query) return data;
            else return data.filter(worker => {
                let is_good = true;
                for(const prop in query) {
                    if (query.hasOwnProperty(prop)) {
                        if (worker[prop] !== query[prop]) {
                            is_good = false;
                        }
                    }
                }
                return is_good;
            });
        } catch (err) {
            console.log(err);
            console.log('API: Failed to request getWorkers');
            return false;
        }
    }
}