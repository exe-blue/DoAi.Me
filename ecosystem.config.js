module.exports = {
    apps: [
      {
        name: 'agent-farm',
        script: './agent/agent.js',
        watch: false,
        autorestart: true,
        restart_delay: 5000,
        env: {
          NODE_ENV: 'production'
        }
      }
    ]
  }