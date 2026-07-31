// PM2 — bridge de contexto Jesus (rode no MESMO VPS do OpenClaw).
//   pm2 start ecosystem.bridge.cjs
//   pm2 logs bridge-jesus
module.exports = {
  apps: [
    {
      name: "bridge-jesus",
      script: "bridge.py",
      interpreter: "python3",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      time: true,
      // Variáveis vêm do .env (lido pelo próprio bridge.py).
    },
  ],
};
