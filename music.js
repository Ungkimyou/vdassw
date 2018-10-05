const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const Youtube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new Youtube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('im ready!'));

client.on('disconnect', () => console.log('disconnected, reconnecting now....'));

client.on('reconnecting', () => console.log('reconnected!'));

client.on('message', async msg => {
    if(msg.author.bot) return undefined;
    if(!msg.content.startsWith(PREFIX)) return undefined;
    const args = msg.content.split(' ');
    const searchString = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const serverQueue = queue.get(msg.guild.id);

    if (msg.content.startsWith(`${PREFIX}play`)) {
        const voiceChannel = msg.member.voiceChannel;
        if(!voiceChannel) return msg.channel.send(`YOU NEED TO BE IN VC TO PLAY MUSIC XD`);
        const permissons = voiceChannel.permissionsFor(msg.client.user);
        if (!permissons.has('CONNECT')){
            return msg.channel.send('I CANT CONNECT TO VC, PLS MAKE SURE I HAVE ENUFF PERMS');
        }
        if(!permissons.has('SPEAK')){
            return msg.channel.send('I CANT SPEAK IN VC, PLS MAKE SURE I HAVE ENUFF PERMS');
        }
        
        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();
            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line-no-await-in-loop
                await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line-no-await-in-loop
            }
            return msg.channel.send(`Playlist: **${playlist.title}** has been added to queue!`);
        } else {
            try {
                var video = await youtube.getVideo(url);
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;
                    msg.channel.send(`
__**Song selection:**__

${videos.map(video2 => `**${++index}  -** ${video2.title}`).join('\n')}
                    
Please provide a value to select the search results from 1-10
                    `);
                    //eslint-disable-next-line-max-depth
                    try {
                        var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                            maxMatches: 1,
                            time: 10000,
                            errors: ['time']
                        });                       
                    } catch (err) {
                        console.error(err);
                        return msg.channel.send('No or invalid value entered, cancelling video search.');                       
                    }
                    const videoIndex = parseInt(response.first().content);
                    var video = await youtube.getVideoByID(videos[videoIndex - 1].id);                           
                } catch (err) {
                    console.error(err);
                    return msg.channel.send('I could not obtain any search results.');
                }
           }
        
           return handleVideo(video, msg, voiceChannel);

        }
    } else if (msg.content.startsWith(`${PREFIX}skip`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('YOU AINT IN VC!');
        if (!serverQueue) return msg.channel.send('THERE IS NO MUSIC TO SKIP LOL!');
        serverQueue.connection.dispatcher.end('skip command has been used');
        return undefined;
    } else if (msg.content.startsWith(`${PREFIX}stop`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('YOU AINT IN VC!');
        if(!serverQueue) return msg.channel.send('THERE IS NO MUSIC TO STOP LOL!');
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end('Stop command has been used');
        return undefined;
    } else if (msg.content.startsWith(`${PREFIX}volume`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('YOU AINT IN VC!');
        if (!serverQueue) return msg.channel.send('THERE IS NOTHING PLAYING LOL!');
        if (!args[1]) return msg.channel.send(`The current volume is: **${serverQueue.volume}**`);
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        return msg.channel.send(`Volume set to **${args[1]}**`);
    } else if (msg.content.startsWith(`${PREFIX}np`)) {
        if(!serverQueue) return msg.channel.send('THERE IS NOTHING PLAYING LOL!');
        return msg.channel.send(`Now playing: **${serverQueue.songs[0].title}**`);
    } else if (msg.content.startsWith(`${PREFIX}queue}`)) {
        if (!serverQueue) return msg.channel.send('THERE IS NOTHING PLAYING LOL!');
        return msg.channel.send(`
__**Song queue:**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Now playing:** ${serverQueue.songs[0].title}
        `);
    } else if (msg.content.startsWith(`${PREFIX}pause`)) {
        if (serverQueue && serverQueue.playing) {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause();
            return msg.channel.send('MUSIC PAUSED');   
        } 
        return msg.channel.send('THERS NO MUSIC PLAYING');
    } else if (msg.content.startsWith(`${PREFIX}resume`)) {
        if (serverQueue && !serverQueue.playing) {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            return msg.channel.send('MUSIC RESUMED');
        } 
        return msg.channel.send('THERS NO MUSIC PLAYING');
    }

    return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
    const serverQueue = queue.get(msg.guild.id);
    console.log(video);
        const song = {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        };
        if (!serverQueue) {
            const queueConstruct = {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };
            queue.set(msg.guild.id, queueConstruct);

            queueConstruct.songs.push(song);

            try{
                var connection = await voiceChannel.join();
                queueConstruct.connection = connection;
                play(msg.guild, queueConstruct.songs[0]);
            } catch (error) {
                console.error(`I CANT JOIN VC: ${error}`);
                queue.delete(msg.guild.id);
                return msg.channel.send(`I CANT JOIN VC: ${error}`);
            }    
        } else {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);
            if (playlist) return undefined;
            else return msg.channel.send(`**${song.title}** has been added to queue!`);
        }
        return undefined;
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log(serverQueue.songs)

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on('end', reason => {
            if (reason === 'Stream is not generating quickly enough.') console.log('song ended');
            else console.log(reason)
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on('error', error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    serverQueue.textChannel.send(`Start Playing **${song.title}**`)
}

client.login(process.env.BOT_TOKEN);
