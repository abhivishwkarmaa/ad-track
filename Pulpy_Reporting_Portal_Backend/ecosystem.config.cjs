module.exports = {
  apps: [
    {
      name: 'Pulpy',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',

      env: {
        NODE_ENV: 'production',
        PORT: 5001,
        PROCESS_TYPE: 'api',
        START_WORKERS_WITH_API: 'false' // Explicitly disable workers in API
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5001,
        PROCESS_TYPE: 'api',
        START_WORKERS_WITH_API: 'false'
      },

      // PM2 stability controls
      max_memory_restart: '1G',
      max_restarts: 10,
      min_uptime: '10s',

      // Logging
      out_file: 'logs/api-server-out.log',
      error_file: 'logs/api-server-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    {
      name: 'click-worker',
      script: 'click-worker.js',
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker'
      },
      env_development: {
        NODE_ENV: 'development',
        PROCESS_TYPE: 'worker'
      },

      max_memory_restart: '500M',
      max_restarts: 5,
      min_uptime: '30s',

      out_file: 'logs/click-worker-out.log',
      error_file: 'logs/click-worker-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    {
      name: 'stats-worker',
      script: 'stats-worker.js',
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker'
      },
      env_development: {
        NODE_ENV: 'development',
        PROCESS_TYPE: 'worker'
      },

      max_memory_restart: '300M',
      max_restarts: 5,
      min_uptime: '30s',

      out_file: 'logs/stats-worker-out.log',
      error_file: 'logs/stats-worker-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    {
      name: 'conversion-worker',
      script: 'conversion-worker.js',
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker'
      },
      env_development: {
        NODE_ENV: 'development',
        PROCESS_TYPE: 'worker'
      },

      max_memory_restart: '300M',
      max_restarts: 5,
      min_uptime: '30s',

      out_file: 'logs/conversion-worker-out.log',
      error_file: 'logs/conversion-worker-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    {
      name: 'postback-worker',
      script: 'postback-worker.js',
      instances: 2,  // Run multiple instances for higher throughput
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker'
      },
      env_development: {
        NODE_ENV: 'development',
        PROCESS_TYPE: 'worker'
      },

      max_memory_restart: '400M',
      max_restarts: 5,
      min_uptime: '30s',

      out_file: 'logs/postback-worker-out.log',
      error_file: 'logs/postback-worker-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
