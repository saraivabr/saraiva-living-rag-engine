import fetch from 'node-fetch';

async function testKey() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY não definida no ambiente.');
    process.exit(1);
  }

  console.log('Testando contra a API da Groq...');
  try {
    const resGroq = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    console.log('Status Groq:', resGroq.status);
    if (resGroq.ok) {
      const data = await resGroq.json();
      console.log('Modelos Groq disponíveis:', data.data.map(m => m.id).filter(id => id.includes('whisper')));
    }
  } catch (e) {
    console.log('Erro Groq:', e);
  }

  console.log('\nTestando contra a API do Deepgram...');
  try {
    const resDeepgram = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` }
    });
    console.log('Status Deepgram:', resDeepgram.status);
    if (resDeepgram.ok) {
      console.log('Resposta Deepgram:', await resDeepgram.json());
    }
  } catch (e) {
    console.log('Erro Deepgram:', e);
  }
}

testKey();
