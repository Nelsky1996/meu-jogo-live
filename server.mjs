import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware para processar JSON e formulários URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir a interface gráfica localizada na pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Estado persistente em memória para o ranking de curtidas
const likesRanking = {};

// Função auxiliar para ordenar e devolver os 5 utilizadores com mais likes
function getTopRanking() {
    return Object.entries(likesRanking)
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

// Transmissão de eventos para todos os ecrãs/navegadores ligados
function broadcast(data) {
    let entregues = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
            entregues++;
        }
    });
    return entregues;
}

// Lógica de atualização de curtidas (Likes)
function processLike(usuario, qtdLikes) {
    const userLimpo = String(usuario || 'espectador').replace('@', '').trim();
    const quantidade = parseInt(qtdLikes) || 1;

    if (!likesRanking[userLimpo]) {
        likesRanking[userLimpo] = 0;
    }
    likesRanking[userLimpo] += quantidade;

    const top5 = getTopRanking();
    const ecrãs = broadcast({
        type: 'UPDATE_RANKING',
        ranking: top5
    });

    console.log(`❤️ [LIKE] @${userLimpo} (+${quantidade} likes) | Ecrãs notificados: ${ecrãs}`);
}

// Lógica de processamento de presentes (Gifts) e acionamento dos bonecos
function processGift(usuario, presenteName, quantidade) {
    const userLimpo = String(usuario || 'Apoiador').replace('@', '').trim();
    const nomePresente = String(presenteName || 'Presente').trim();
    const pLower = nomePresente.toLowerCase();
    const qtd = parseInt(quantidade) || 1;

    let targetBaby = 1;
    let actionType = 'eat';

    // Regras de mapeamento dos presentes:
    // Bebé 1: Rosa / Rose -> Ação de Comer (eat)
    // Bebé 2: Sorvete / Gelado / Ice Cream -> Ação de Dançar (dance)
    // Bebé 3: Qualquer outro presente -> Ação de Susto (scare)
    if (pLower.includes('rosa') || pLower.includes('rose')) {
        targetBaby = 1;
        actionType = 'eat';
    } else if (pLower.includes('sorvete') || pLower.includes('gelado') || pLower.includes('ice cream')) {
        targetBaby = 2;
        actionType = 'dance';
    } else {
        targetBaby = 3;
        actionType = 'scare';
    }

    const ecrãs = broadcast({
        type: 'TRIGGER_BABY',
        target: targetBaby,
        action: actionType,
        donor: userLimpo,
        giftName: nomePresente,
        repeatCount: qtd
    });

    console.log(`🎁 [PRESENTE] @${userLimpo} enviou ${nomePresente} x${qtd} -> Bebé ${targetBaby} [${actionType}] | Ecrãs notificados: ${ecrãs}`);
}

// Ligação de clientes WebSocket (o ecrã do jogo em index.html)
wss.on('connection', (ws) => {
    console.log(`🟢 [Jogo] Novo ecrã conectado. (Total de ecrãs ativos: ${wss.clients.size})`);

    // Envia imediatamente o placar atual para o ecrã recém-ligado
    ws.send(JSON.stringify({
        type: 'UPDATE_RANKING',
        ranking: getTopRanking()
    }));

    ws.on('close', () => {
        console.log(`🔴 [Jogo] Ecrã desconectado. (Restantes: ${wss.clients.size})`);
    });
});

// -------------------------------------------------------------------------
// ROTAS DE RECEÇÃO DE DADOS (Compatíveis com GET e POST para TikFinity/Testes)
// -------------------------------------------------------------------------

// Endpoint para Presentes (Gift)
app.all(['/api/tiktok-event', '/teste-presente', '/api/gift'], (req, res) => {
    const query = req.query || {};
    const body = req.body || {};

    const nome = query.giftName || query.nome || body.giftName || body.gift || 'Rosa';
    const usuario = query.user || query.username || body.user || body.username || 'Apoiador';
    const qtd = query.repeatCount || query.qtd || body.repeatCount || body.count || 1;

    processGift(usuario, nome, qtd);
    res.status(200).send(`🎁 Presente processado com sucesso: ${nome} x${qtd} de @${usuario}`);
});

// Endpoint para Curtidas (Likes)
app.all(['/api/tiktok-like', '/teste-like'], (req, res) => {
    const query = req.query || {};
    const body = req.body || {};

    const usuario = query.user || query.username || body.user || body.username || 'Apoiador';
    const qtd = query.likeCount || query.qtd || body.likeCount || body.count || 1;

    processLike(usuario, qtd);
    res.status(200).send(`❤️ Likes processados com sucesso: +${qtd} de @${usuario}`);
});

// A porta é definida dinamicamente pelo Render/Heroku via process.env.PORT ou 3000 localmente
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor a correr na porta ${PORT}`);
    console.log(`📡 Endpoints ativos: /api/tiktok-event e /api/tiktok-like`);
});