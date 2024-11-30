import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from './logger.js';

export async function fishing(token, type = '1', proxy) {
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    if (type === '1') {
        type = 'short_range';
    } else if (type === '2') {
        type = 'mid_range';
    } else {
        type = 'long_range';
    }

    const url = `wss://fishing-frenzy-api-0c12a800fbfe.herokuapp.com/?token=${token}`;
    const ws = new WebSocket(url, { agent });

    let isGameInitialized = false;
    let frames = [];
    let frameCount = 0;
    let startTime = Date.now();
    const maxFrames = 15;

    const startNewGame = () => {
        if (!isGameInitialized) {
            const message = JSON.stringify({ cmd: "prepare", range: type });
            ws.send(message);
            logger('Prepare For Fishing...', 'info');
        } else {
            const start = JSON.stringify({ cmd: "start" });
            setTimeout(() => {
                ws.send(start);
                logger('Fishing Starting...', 'info');
            }, 1000);
        }
    };

    const endGame = () => {
        let endTime = Date.now();
        let durationInSeconds = Math.floor((endTime - startTime) / 1000);
        let fpsCalculated = frameCount / durationInSeconds;

        const endResponse = {
            cmd: "end",
            rep: {
                fs: frameCount,
                ns: frames.length,
                fps: fpsCalculated,
                frs: frames,
            },
            en: 1,
        };
        ws.send(JSON.stringify(endResponse));
        logger('Game ended, results sent.', 'info');
    };

    const handleGameState = (message) => {
        if (message.type === 'gameState') {
            frameCount++;
            let x = calculatePositionX(message.frame, message.dir);
            let y = calculatePositionY(message.frame, message.dir);

            frames.push([x, y]);
            if (frameCount >= maxFrames) {
                endGame();
            }
        }
    };

    const calculatePositionX = (frame, dir) => {
        return 450 + frame * 2 + dir * 5;
    };

    const calculatePositionY = (frame, dir) => {
        return 426 + frame * 2 - dir * 3;
    };

    ws.on('open', () => {
        logger(`Connected to WebSocket server`, 'info');
        startNewGame();
    });

    ws.on('message', (data) => {
        const message = data.toString();
        try {
            const parsedData = JSON.parse(message);

            if (parsedData.type === 'initGame') {
                const fish = parsedData.data.randomFish.fishName;
                logger(`Trying to Catch Fish: ${fish}`, 'info');

                isGameInitialized = true;
                startNewGame();
            }

            if (parsedData.type === 'gameState') {
                handleGameState(parsedData);
            }

            if (parsedData.type === 'gameOver') {
                const energy = parsedData.catchedFish?.energy || 0;
                if (parsedData.success) {
                    logger(`Game succeeded! Fish Caught: ${parsedData.catchedFish.fishName} | Energy Left: ${energy}`, 'success');
                } else {
                    logger('Game failed', 'error');
                }
            }
        } catch (error) {
            logger(`Failed to parse WebSocket message: ${error.message}`, 'error');
        }
    });

    ws.on('error', (err) => {
        logger(`WebSocket error: ${err.message}`, 'error');
        ws.close();
    });

    ws.on('close', (code, reason) => {
        logger(`WebSocket closed: Code ${code} | Reason: ${reason}`, 'warn');
        if (code !== 1000) {
            logger('Retrying connection in 5 seconds...', 'warn');
            setTimeout(() => fishing(token, type, proxy), 5000);
        }
    });
}
