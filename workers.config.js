module.exports = {
    apps: [
        {
            name: "worker",
            script: "./worker.js",
            instances: 3,
            exec_mode: "cluster",
            max_restarts: 10000
        }
    ]
}