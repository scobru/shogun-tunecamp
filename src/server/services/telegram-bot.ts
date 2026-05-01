import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { ScannerService } from '../scanner.js';
import { DatabaseService } from '../database.js';

export class TelegramBotService {
    private bot?: Telegraf;
    private isRunning = false;

    constructor(
        private database: DatabaseService,
        private scanner: ScannerService,
        private musicDir: string
    ) {}

    async start() {
        if (this.isRunning) return;

        // Try to get token from settings first, then fall back to env
        let token = this.database.getSetting('telegram_bot_token');
        if (!token) {
            token = process.env.TELEGRAM_BOT_TOKEN;
        }

        if (!token) {
            console.warn('[TelegramBot] No bot token found in settings or environment. Telegram integration will be inactive.');
            return;
        }

        try {
            this.bot = new Telegraf(token);

            // Audio messages
            this.bot.on('audio', async (ctx) => {
                await this.handleAudio(ctx, ctx.message.audio);
            });

            // Documents that might be audio
            this.bot.on('document', async (ctx) => {
                const doc = ctx.message.document;
                if (doc.mime_type?.startsWith('audio/') || 
                    ['.mp3', '.flac', '.wav', '.ogg', '.m4a'].some(ext => doc.file_name?.toLowerCase().endsWith(ext))) {
                    await this.handleAudio(ctx, doc);
                }
            });

            // Welcome/Info
            this.bot.command('start', (ctx) => ctx.reply('Tunecamp Music Ingester Bot is active! Send me audio files or music links to add them to your library.'));
            this.bot.command('status', (ctx) => ctx.reply(`Active. Chat ID: ${ctx.chat.id}`));

            await this.bot.launch();
            this.isRunning = true;
            console.log('✅ Telegram Bot started');
            
            // Handle graceful stop
            process.once('SIGINT', () => this.stop());
            process.once('SIGTERM', () => this.stop());
            
        } catch (err) {
            console.error('[TelegramBot] Failed to start:', err);
        }
    }

    async stop() {
        if (this.bot) {
            this.bot.stop('SIGTERM');
            this.isRunning = false;
            console.log('[TelegramBot] Stopped');
        }
    }

    private async handleAudio(ctx: any, audio: any) {
        const chatId = ctx.chat.id.toString();
        const allowedChannels = this.database.getSetting('telegram_allowed_channels');
        
        if (allowedChannels) {
            const allowed = allowedChannels.split(',').map(s => s.trim());
            const senderId = ctx.from?.id?.toString();
            
            if (!allowed.includes(chatId) && (!senderId || !allowed.includes(senderId))) {
                console.warn(`[TelegramBot] Unauthorized message from chat ${chatId} (sender ${senderId})`);
                return;
            }
        }

        try {
            const fileLink = await ctx.telegram.getFileLink(audio.file_id);
            const fileName = audio.file_name || `${audio.file_unique_id}.mp3`;
            const importDir = path.join(this.musicDir, 'imports', 'telegram');
            await fs.ensureDir(importDir);

            const filePath = path.join(importDir, fileName);
            
            await ctx.reply(`📥 Downloading ${fileName}...`);
            
            const response = await axios({
                url: fileLink.href,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', (err) => reject(err));
            });

            await ctx.reply(`⚙️ Processing ${fileName}...`);
            const result = await this.scanner.processAudioFile(filePath, this.musicDir);

            if (result?.success) {
                await ctx.reply(`✅ Successfully imported to library!\nArtist: ${result.message.includes('Track updated') ? 'Updated' : 'New track added'}`);
            } else {
                await ctx.reply(`❌ Import failed: ${result?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('[TelegramBot] Error handling audio:', err);
            await ctx.reply('❌ Error processing audio file. Please check server logs.');
        }
    }
}
