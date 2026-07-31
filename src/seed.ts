import { config } from './config.js';
import { resolveUserId, getRecentMedia, getComments } from './instagram/client.js';
import { loadStore } from './store/repliedStore.js';

/**
 * Marca todos os comentários atuais (dos posts recentes) como "já vistos",
 * sem respondê-los. Use uma vez antes de ligar ao vivo, para o respondedor
 * tratar apenas comentários NOVOS daqui pra frente.
 *
 *   node dist/seed.js
 */
async function main(): Promise<void> {
  const userId = await resolveUserId();
  const store = await loadStore();
  const media = await getRecentMedia(userId, config.behavior.mediaLimit);

  let marked = 0;
  for (const post of media) {
    const comments = await getComments(post.id);
    for (const c of comments) {
      if (!store.hasPublicReply(c.id)) {
        await store.markPublicReply(c.id);
        marked++;
      }
    }
  }

  console.log(
    `✔ Seed concluído: ${marked} comentário(s) marcado(s) como vistos em ${media.length} post(s). ` +
      `O respondedor agora só vai tratar comentários novos.`,
  );
}

main().catch((err) => {
  console.error(`✖ Falha no seed: ${(err as Error).message}`);
  process.exit(1);
});
