/**
 * PM2 Ecosystem Config — Agent 프로세스 매니저
 *
 * 설치: npm install -g pm2 pm2-windows-startup
 * 시작: pm2 start agent/ecosystem.config.js
 * 상태: pm2 status
 * 로그: pm2 logs
 * 재시작: pm2 restart agent
 * Windows 시작 등록: pm2-startup install && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'agent',
      script: 'agent/agent.js',
      cwd: __dirname + '/..',
      max_restarts: 10,
      restart_delay: 5000,
      listen_timeout: 10000,
      kill_timeout: 5000,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'agent/logs/pm2-error.log',
      out_file: 'agent/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
