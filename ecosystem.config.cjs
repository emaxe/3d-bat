// PM2 ecosystem for 3d-bat Vite servers.
// Purpose: keep dev/preview OUT of the hermes-gateway cgroup — an OOM kill inside
// the gateway's cgroup makes systemd restart the whole gateway (task interruption).
// Memory-guarded via NODE_OPTIONS so a runaway build can never blow up the 2.9GB box.
module.exports = {
  apps: [
    {
      name: '3d-bat-dev',
      cwd: '/root/projects/3d-bat',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host --port 5173',
      interpreter: 'node',
      env: { NODE_OPTIONS: '--max-old-space-size=1024' },
      max_memory_restart: '1G',
      autorestart: true,
      exp_backoff_restart_delay: 2000,
    },
    {
      name: '3d-bat-preview',
      cwd: '/root/projects/3d-bat',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host --port 4173',
      interpreter: 'node',
      env: { NODE_OPTIONS: '--max-old-space-size=1024' },
      max_memory_restart: '1G',
      autorestart: true,
      exp_backoff_restart_delay: 2000,
    },
  ],
};
