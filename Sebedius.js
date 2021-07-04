const { readdirSync, readFileSync, existsSync } = require('fs');
const Keyv = require('keyv');
const Discord = require('discord.js');
const YZCrit = require('./yearzero/YZCrit');
const Util = require('./utils/Util');
const PageMenu = require('./utils/PageMenu');
const ContextMessage = require('./utils/ContextMessage');
const RollTable = require('./utils/RollTable');
const Errors = require('./utils/errors');
const CharacterManager = require('./yearzero/models/CharacterManager');
const { SUPPORTED_GAMES, SUPPORTED_LANGS, DICE_ICONS, SOURCE_MAP } = require('./utils/constants');
const { version } = require('./package.json');
const { __ } = require('./lang/locales');

/**
 * Databases map.
 * @type {Object} { name: namespace }
 * @constant
 */
const DB_MAP = {
	prefixes: 'prefix',
	initiatives: 'initiative',
	games: 'game',
	langs: 'lang',
	combats: 'combat',
	characters: 'character',
	stats: 'count',
	blacklistedGuilds: 'blacklisted',
	mutedUsers: 'muted',
};

if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config();
}

/**
 * ! SEBEDIUS !
 * @extends {Discord.Client}
 */
class Sebedius extends Discord.Client {
	/**
	 * Sebedius Client
	 * @param {*} config Config data (JSON file)
	 */
	constructor(config) {
		// ClientOptions: https://discord.js.org/#/docs/main/master/typedef/ClientOptions
		super({
			messageCacheMaxSize: 100,
			messageCacheLifetime: 60 * 10,
			messageSweepInterval: 90,
			// partials: ['MESSAGE', 'REACTION'],
			ws: {
				// Intents: https://discordjs.guide/popular-topics/intents.html#the-intents-bit-field-wrapper
				// GUILD_PRESENCES & GUILD_MEMBERS are restricted by here are needed for !admin command.
				intents: [
					'GUILDS',
					// 'GUILD_PRESENCES',
					// 'GUILD_MEMBERS',
					'GUILD_MESSAGES',
					'GUILD_MESSAGE_REACTIONS',
					'DIRECT_MESSAGES',
					'DIRECT_MESSAGE_REACTIONS',
				],
			},
		});
		this.state = 'init';
		this.muted = false;
		this.config = config;
		this.version = version;

		// Caching for the current session.
		this.blacklistedGuilds = new Set();
		this.mutedUsers = new Set();
		this.prefixes = new Discord.Collection();
		this.games = new Discord.Collection();
		this.langs = new Discord.Collection();
		this.combats = new Discord.Collection();
		this.initiatives = new Set();
		this.cooldowns = new Discord.Collection();

		/**
		 * The bot's library of commands.
		 * @type {Discord.Collection<string, import('./utils/Command')>} K: commandName, V: command
		 */
		this.commands = new Discord.Collection();
		this.addCommands();

		// Keyv Databases.
		console.log('[+] - Keyv Databases');
		this.dbParams = '?ssl=true&sslmode=require&sslfactory=org.postgresql.ssl.NonValidatingFactory';
		this.dbUri = process.env.NODE_ENV === 'production' ? `${process.env.DATABASE_URL}${this.dbParams}` : null;
		// this.dbUri = `${process.env.DATABASE_URL}${this.dbParams}`;
		console.log('      > Creation...');
		this.kdb = {};
		for (const name in DB_MAP) {
			console.log(`        bot.kdb.${name}: "${DB_MAP[name]}"`);
			this.kdb[name] = new Keyv(this.dbUri, { namespace: DB_MAP[name] });
			this.kdb[name].on('error', err => console.error(`Keyv Connection Error: ${name.toUpperCase()}\n`, err));
		}

		// Managers.
		/** @type {CharacterManager} */
		this.characters = new CharacterManager(this.kdb.characters);

		// Ready.
		console.log('      > Loaded & Ready!');
	}

	/**
	 * The ID of the user that the client is logged in as.
	 * @type {Discord.Snowflake}
	 */
	get id() {
		return this.user.id;
	}

	/**
	 * The bot's mention.
	 * @type {string} `<@0123456789>`
	 * @readonly
	 */
	get mention() {
		return Sebedius.getMention(this.user);
	}

	/**
	 * The bot's invite link.
	 * @type {string}
	 * @readonly
	 */
	get inviteURL() {
		const perms = this.config.perms.bitfield;
		return `https://discord.com/oauth2/authorize?client_id=${this.id}&scope=bot&permissions=${perms}`;
	}

	/**
	 * The number of guilds.
	 * @type {number}
	 * @readonly
	 */
	get guildCount() {
		return this.guilds.cache.size;
	}

	/**
	 * Creates the list of commands.
	 */
	addCommands() {
		// Imports each command from subdirectories.
		// Warning: bot crashes if a command is not in a subdir.
		/* const dir = './commands/';
		readdirSync(dir).forEach(d => {
			const commands = readdirSync(`${dir}/${d}/`).filter(f => f.endsWith('.js'));
			for (const file of commands) {
				const command = require(`${dir}/${d}/${file}`);
				this.commands.set(command.name, command);
				console.log(`[+] - Command loaded: ${command.name}.js`);
			}
		}); //*/
		// Imports each command from a single directory.
		const commandFiles = readdirSync('./commands').filter(file => file.endsWith('.js'));

		for (const file of commandFiles) {
			const command = require('./commands/' + file);
			this.commands.set(command.name, command);
			console.log(`[+] - Command loaded: ${command.name}.js`);
		}
	}

	/**
	 * Logs a message to the LogChannel of the bot.
	 * @param {Discord.StringResolvable|Discord.APIMessage} [message=''] The message to log
	 * @param {Discord.MessageOptions|Discord.MessageAdditions} [options={}] The options to provide
	 * @see Discord.TextChannel.send()
	 * @async
	 */
	async log(message = '', options = {}) {
		if (typeof message === 'string') console.log(`:>> ${message}`);
		else if (message instanceof Discord.MessageEmbed) console.log(`:>> ${message.title} — ${message.description}`);
		else console.log(':>> [LOG]\n', message);

		if (!message || this.state !== 'ready') return;

		const channel = this.logChannel
			|| this.channels.cache.get(this.config.botLogChannelID)
			|| await this.channels.fetch(this.config.botLogChannelID);

		if (channel) return await channel.send(message, options).catch(console.error);
	}

	/**
	 * Gets all the entries of a database.
	 * @param {string} name Database's name
	 * @param {?string} namespace Database's namespace, if you one to specify another one.
	 * @returns {Promise<Array<String, String>>} Promise of an Array of [Key, Value]
	 * @async
	 */
	async kdbEntries(name, namespace = null) {
		let entries = [];
		const db = this.kdb[name];
		if (db) {
			const store = db.opts.store;
			if (store instanceof Map) {
				entries = [...store.entries()];
			}
			else if (!store) {
				const msg = 'Sebedius | kdbEntries | undefined store';
				console.warn(msg);
				this.log(msg);
				return entries;
			}
			else {
				const nmspc = namespace ? namespace : DB_MAP[name] || name;
				entries = await store.query(
					`SELECT * FROM keyv
					WHERE key LIKE '${nmspc}%'`,
				);
				entries = entries.map(kv => [kv.key, kv.value]);
			}
		}
		return entries;
	}

	/**
	 * Removes all entries in the database for a guild.
	 * @param {Discord.Snowflake} guildID
	 * @returns {string[]} An array with the names of the databases where an entry has been removed.
	 */
	async kdbCleanGuild(guildID) {
		// List of databases' names that can contain entries from a guild.
		const kdbs = ['prefixes', 'initiatives', 'games', 'langs'];
		const deletedEntries = [];

		// Iterates over the databases
		for (const name of kdbs) {
			// Deletes the entry, if any.
			const del = await this.kdb[name].delete(guildID);
			if (del) {
				// If deleted, removes it also from the cache.
				this[name].delete(guildID);
				// And registers the occurence of a deletion.
				deletedEntries.push(name);
			}
		}
		return deletedEntries;
	}

	/**
	 * Populates mutedUsers & blacklistedGuilds Sets.
	 * @async
	 */
	async populateBans() {
		const bans = ['mutedUsers', 'blacklistedGuilds'];
		for (const b of bans) {
			(await this.kdbEntries(b)).forEach(e => {
				const regex = new RegExp(`${DB_MAP[b]}:(\\d+)`);
				const uid = e[0].replace(regex, '$1');
				this[b].add(uid);
				console.log(`>! ${DB_MAP[b].toUpperCase()}: ${uid}`);
			});
		}
	}

	/**
	 * Gets a User.
	 * @param {Discord.Snowflake} userId User ID
	 * @returns {Promise<Discord.User>}
	 * @async
	 */
	async getUser(userId) {
		let user = this.users.cache.get(userId);
		if (!user) user = await this.users.fetch(userId).catch(console.error);
		return user;
	}

	/**
	 * Gets a Channel.
	 * @param {Discord.Snowflake} chanId Channel ID
	 * @returns {Promise<Discord.BaseChannel>}
	 * @async
	 */
	async getChannel(chanId) {
		let chan = this.channels.cache.get(chanId);
		if (!chan) chan = await this.channels.fetch(chanId).catch(console.error);
		return chan;
	}

	/**
	 * Gets a Guild.
	 * @param {Discord.Snowflake} guildId Guild ID, or guild's Channel ID.
	 * @returns {Promise<Discord.Guild>}
	 * @async
	 */
	async getGuild(guildId) {
		let guild = this.guilds.cache.get(guildId);
		if (!guild) guild = await this.guilds.fetch(guildId).catch(console.error);
		if (!guild) {
			const chan = await this.getChannel(guildId);
			if (chan) guild = chan.guild;
		}
		return guild;
	}

	/**
	 * Gets the prefix for the server.
	 * @param {Discord.Message} message Discord message
	 * @returns {string}
	 * @async
	 */
	async getServerPrefix(message) {
		const prefixes = await this.getPrefixes(message);
		return prefixes[0];
	}

	/**
	 * Gets the list of prefixes in an array.
	 * @param {Discord.Message} message Discord message
	 * @returns {string[]}
	 * @async
	 */
	async getPrefixes(message) {
		const fetchedPrefix = await Sebedius.getConf('prefixes', message, this, this.config.defaultPrefix);
		return whenMentionedOrPrefixed(fetchedPrefix, this);
	}

	/**
	 * Gets the desired game (used for the dice icons skin).
	 * @param {Discord.Message} message Discord message
	 * @param {?string} defaultGame Fallback default game
	 * @returns {string}
	 * @async
	 */
	async getGame(message, defaultGame = null) {
		const game = await Sebedius.getConf('games', message, this, defaultGame);
		if (!game) return await Sebedius.getGameFromSelection(message);
		return game;
	}

	/**
	 * Gets the desired game from a selection message.
	 * @param {Discord.Message} message Discord message
	 * @returns {string}
	 * @async
	 */
	static async getGameFromSelection(message) {
		const gameChoices = SUPPORTED_GAMES.map(g => [SOURCE_MAP[g], g]);
		const lang = await Sebedius.getLanguage(message);
		return await Sebedius.getSelection(message, gameChoices, { lang });
	}

	/**
	 * Gets the language desired (used for the tables).
	 * @param {Discord.Message} message Discord message
	 * @returns {string} two-letters code for the desired language
	 * @async
	 */
	async getLanguage(message) {
		return await Sebedius.getConf('langs', message, this, 'en');
	}

	/**
	 * Takes the provided language code, checks it against the SUPPORTED_LANGS-table
	 * and if not found calls the getLanguage-method to read from DB or return default
	 * @param {string} lang Language code (for example provided by arguments)
	 * @param {ContextMessage} ctx The context (for bot and guild.id)
	 * @returns {string} A valid language code
	 */
	async getValidLanguageCode(lang, ctx) {
		return Object.keys(SUPPORTED_LANGS).includes(lang)
			? lang
			: await this.getLanguage(ctx);
	}

	/**
	 * Gets the a Combat instance.
	 * @param {Discord.Message} message Discord message
	 * @returns {string} two-letters code for the desired language
	 * @async
	 */
	async getCombat(message) {
		return await Sebedius.getConf('combats', message.channel.id, this, null);
	}

	/**
	 * Gets an item from a Collection tied to a Sebedius client.
	 * @param {string} collectionName Name of the Collection
	 * @param {string} dbNamespace Namespace for the database
	 * @param {Discord.Message} message Discord message
	 * @param {Discord.Client} client Discord client (the bot)
	 * @param {?*} [defaultItem=null] The default item returned if nothing found.
	 * @throws {SebediusError} If the collection doesn't exist.
	 * @returns {*}
	 * @static
	 * @async
	 */
	static async getConf(collectionName, message, client, defaultItem = null) {
		if (!message.guild) return defaultItem;
		if (!client[collectionName]) throw new Errors.SebediusError(`Collection-property unknown: ${collectionName}`);

		const guildID = message.guild.id;
		let fetchedItem;
		// Checks if already cached.
		if (client[collectionName].has(guildID)) {
			fetchedItem = client[collectionName].get(guildID);
		}
		// Otherwise, loads from db and cache.
		else {
			fetchedItem = await client.kdb[collectionName].get(guildID)
				.catch(console.error);
			if (!fetchedItem) fetchedItem = defaultItem;
			if (fetchedItem) client[collectionName].set(guildID, fetchedItem);
		}
		// Returns the fetched prefixes.
		return fetchedItem;
	}

	/**
	 * Increases by 1 the number of uses for this command.
	 * Used for statistics purposes.
	 * @param {string} commandName The command.name property
	 * @param {Discord.Message} message Discord message
	 * @returns {number}
	 * @async
	 */
	async raiseCommandStats(commandName, message) {
		if (commandName === 'roll' || commandName === 'crit') {
			const defaultGame = await this.constructor.getConf('games', message, message.bot);
			if (defaultGame) commandName += defaultGame;
		}
		const count = await this.kdb.stats.get(commandName) || 0;
		return await this.kdb.stats.set(commandName, count + 1);
	}

	/**
	 * Gets the commands' statistics.
	 * @returns {Discord.Collection<String, Number>} Collection<CommandName, Count>
	 * @async
	 */
	async getStats() {
		const out = new Discord.Collection();
		for (const cmdName of this.commands.keyArray()) {
			const count = await this.kdb.stats.get(cmdName) || 0;
			out.set(cmdName, count);
		}
		return out;
	}

	/**
	 * Gets a YZ table.
	 * @param {string} type Type of table to return (`"CRIT"` or `null`)
	 * @param {string} path Folder path to the file with the ending `/`
	 * @param {string} fileName Filename without path, ext or lang-ext
	 * @param {string} [lang='en'] The language to use, default is `en` English
	 * @param {string} [ext='csv'] File extension
	 * @returns {RollTable}
	 * @static
	 */
	static getTable(type, path, fileName, lang = 'en', ext = 'csv') {
		const pathName = `${path}${fileName}`;
		let filePath = `${pathName}.${lang}.${ext}`;

		// If the language does not exist for this file, use the english default.
		if (!existsSync(filePath)) filePath = `${pathName}.en.${ext}`;

		let elements;
		try {
			const fileContent = readFileSync(filePath, 'utf8');
			elements = Util.csvToJSON(fileContent);
		}
		catch(error) {
			console.error(`[Sebedius.getTable] - File Error: ${filePath}`);
			return null;
		}

		const table = new RollTable(`${fileName}.${lang}.${ext}`);
		for (const elem of elements) {
			if (type === 'CRIT') {
				const entry = new YZCrit(elem);
				table.set(entry.ref, entry);
			}
			else if (type = "MONSTER_SIGNATURE_ATTACKS") {
				let attack = {};
				for (const key in elem) {
					if (Util.isNumber(elem[key])) attack[key] = +elem[key];
					else if (elem[key] === '') attack[key] = null;
					else attack[key] = elem[key];
				}
				table.set(attack.ref, attack);
			}
			else if (elem.hasOwnProperty('ref')) {
				table.set(elem.ref, elem);
			}
			else {
				throw new Errors.SebediusError('Unknown RollTable');
			}
		}

		return table;
	}

	/**
	 * Returns a text with all the dice turned into emojis.
	 * @param {YZRoll} roll The roll
	 * @param {Object} opts Options of the roll command
	 * @param {boolean} [applyAliases=false] Whether to apply the aliases
	 * @returns {string} The manufactured text
	 */
	static emojifyRoll(roll, opts, applyAliases = false) {
		const game = opts.iconTemplate || roll.game;
		let str = '';

		for (const die of roll.dice) {
			const val = die.result;
			const errorIcon = ` \`{${val}}\``;
			let iconType = die.type;

			if (opts.alias) {
				// Skipping types.
				if (opts.alias[die.type] === '--' || die.type == null) continue;
				// Dice swaps, if any.
				if (applyAliases && opts.alias[die.type]) iconType = opts.alias[die.type];
			}
			// Artifact Dice specific skin.
			if (iconType === 'arto') {
				str += DICE_ICONS.fbl.arto[val] || errorIcon;
			}
			// Twilight 2000 specific skin.
			else if (game === 't2k' && iconType === 'base' && die.range !== 6) {
				str += DICE_ICONS.t2k['d' + die.range][val] || errorIcon;
			}
			else {
				const diceTypeIcons = DICE_ICONS[game][iconType];
				str += diceTypeIcons && diceTypeIcons[val]
					? diceTypeIcons[val]
					: errorIcon;
				//str += DICE_ICONS[game][iconType][val] || errorIcon;
			}
		}
		return str;
	}

	/**
	 * Returns the selected choice, or None. Choices should be a list of two-tuples of (name, choice).
	 * If delete is True, will delete the selection message and the response.
	 * If length of choices is 1, will return the only choice unless force_select is True.
	 * @param {Discord.Message}          ctx      Discord message with context
	 * @param {Array<string, Object>[]}  choices  An array of arrays with [name, object]
	 * @param {Object}   options              Options for the selection message
	 * @param {string}   options.text         Additional text to attach to the selection message
	 * @param {boolean}  options.del          Whether to delete the selection message
	 * @param {boolean}  options.pm           Whether the selection message is sent in a PM (Discord DM)
	 * @param {boolean}  options.forceSelect  Whether to force selection even if only one choice possible
	 * @param {string}   options.lang         The language code to be used
	 * @returns {*} The selected choice
	 * @throws {NoSelectionElementsError} If len(choices) is 0.
	 * @throws {SelectionCancelledError} If selection is cancelled.
	 * @static
	 * @async
	 */
	// static async getSelection(ctx, choices, text = null, del = true, pm = false, forceSelect = false, lang = 'en') {
	static async getSelection(ctx, choices, options = {}) {
		// Prepares options.
		const { text, del, pm, forceSelect, lang } = Object.assign({
			text: null,
			del: true,
			pm: false,
			forceSelect: false,
			lang: 'en',
		}, options);

		if (choices.length === 0) throw new Errors.NoSelectionElementsError();
		else if (choices.length === 1 && !forceSelect) return choices[0][1];

		const paginatedChoices = Util.paginate(choices, 10);
		const msgFilter = m =>
			m.author.id === ctx.author.id &&
			m.channel.id === ctx.channel.id &&
			Number(m.content) >= 1 &&
			Number(m.content) <= choices.length;

		// Builds the pages.
		const pages = [];
		paginatedChoices.forEach((_choices, page) => {
			const names = _choices.map(o => o[0]);
			const embed = new Discord.MessageEmbed()
				.setTitle(__('selection-title', lang))
				.setDescription(
					__('selection-description', lang) + '\n'
					+ names
						.map((n, i) => `**[${i + 1 + page * 10}]** – ${n}`)
						.join('\n'),
				);
			if (paginatedChoices.length > 1) {
				embed.setFooter(__('page', lang) + ` ${page + 1}/${paginatedChoices.length}`);
			}
			if (text) {
				embed.addField(__('info', lang), text, false);
			}
			if (pm) {
				embed.addField(
					__('instructions', lang),
					__('selection-instructions', lang),
					false,
				);
			}
			pages.push(embed);
		});
		// Sends the selection message.
		let msgCollector = null;
		const channel = pm ? ctx.author : ctx.channel;
		const time = 30000;
		const pageMenu = new PageMenu(channel, ctx.author.id, time * 2, pages, {
			stop: {
				icon: PageMenu.ICON_STOP,
				owner: ctx.author.id,
				fn: () => msgCollector.stop(),
			},
		});
		// Awaits for the answer.
		let msg = null;
		msgCollector = ctx.channel.createMessageCollector(msgFilter, { max: 1, time });
		msgCollector.on('end', () => pageMenu.stop());

		// Catches the answer or any rejection.
		try {
			msg = await msgCollector.next;
		}
		catch (rejected) {
			throw new Errors.SelectionCancelledError();
		}

		if (!msg || msg instanceof Map) {
			return null;
		}
		// Deletes the answer message.
		if (del && !pm) {
			try {
				await msg.delete();
			}
			catch (err) {
				console.warn('[getSelection] Failed to delete choice message.', err.name, err.code);
			}
		}
		// Returns the choice.
		return choices[Number(msg.content) - 1][1];
	}

	/**
	 * Confirms whether a user wants to take an action.
	 * @param {Discord.Message} message The current message
	 * @param {string} text The message for the user to confirm
	 * @param {boolean} [deleteMessages=false] Whether to delete the messages
	 * @returns {boolean|null} Whether the user confirmed or not. None if no reply was received
	 */
	static async confirm(message, text, deleteMessages = false) {
		const msg = await message.channel.send(text);
		const filter = m =>
			m.author.id === message.author.id
			&& m.channel.id === message.channel.id;
		const reply = (await message.channel.awaitMessages(filter, { max: 1, time: 30000 })).first();
		const replyBool = Util.getBoolean(reply.content) || null;
		if (deleteMessages) {
			try {
				await msg.delete();
				await reply.delete();
			}
			catch (error) { console.error(error); }
		}
		return replyBool;
	}

	/**
	 * Checks if the bot has all the required permissions.
	 * @param {Discord.Message} ctx Discord message with context
	 * @param {number} checkPerms Bitfield / Use this argument if you want to check just a few specific Permissions.
	 * @param {string} language The language code to be used
	 * @returns {boolean} `true` if the bot has all the required Permissions.
	 * @static
	 */
	static async checkPermissions(ctx, checkPerms = null, language = null) {
		const channel = ctx.channel;
		const lang = await ctx.bot.getValidLanguageCode(language, ctx);

		// Exits early if we are in a DM.
		if (channel.type === 'dm') return true;

		const botMember = channel.guild.me;
		const perms = checkPerms || ctx.bot.config.perms.bitfield;
		const serverMissingPerms = botMember.permissions.missing(perms);
		const channelMissingPerms = channel.permissionsFor(botMember).missing(perms);

		// The above functions return an array
		// filled with the flag of the missing Permissions, if any.
		// If not, the arrays are empty (length = 0).
		if (serverMissingPerms.length || channelMissingPerms.length) {
			let msg = `🛑 ${__('bot-missing-permissions', lang).replace('{prefix}', ctx.prefix)}`;
			if (serverMissingPerms.length) {
				msg += `\n**${__('bot-missing-permissions-role', lang)}:** \`${serverMissingPerms.join('`, `')}\``;
			}
			if (channelMissingPerms.length) {
				msg += `\n**${__('bot-missing-permissions-channel', lang)}:** \`${channelMissingPerms.join('`, `')}\``;
			}
			ctx.reply(msg);
			return false;
		}
		else {
			return true;
		}
	}

	/**
	 * Gets a user from its mention.
	 * @param {string} mention The user mention
	 * @param {Discord.Client} client The Discord client (the bot)
	 * @returns {Promise<Discord.User>|Discord.User}
	 * @static
	 * @async
	 */
	static async getUserFromMention(mention, client) {
		// The id is the first and only match found by the RegExp.
		const matches = mention.match(/^<@!?(\d+)>$/);

		// If supplied variable was not a mention, matches will be null instead of an array.
		if (!matches) return;

		// However the first element in the matches array will be the entire mention, not just the ID,
		// so use index 1.
		const id = matches[1];

		if (client.users.cache.has(id)) {
			return client.users.cache.get(id);
		}
		else {
			return await client.users.fetch(id);
		}
	}

	/**
	 * Fetches a Member based on its name, mention or ID.
	 * @param {string} needle Name, mention or ID
	 * @param {Discord.Message} ctx The triggering message with context
	 * @returns {Promise<Discord.Member>}
	 * @static
	 * @async
	 */
	static async fetchMember(needle, ctx) {
		if (Discord.MessageMentions.USERS_PATTERN.test(needle)) {
			return await Sebedius.getUserFromMention(needle, ctx.bot);
		}
		const members = ctx.channel.members;
		return members.find(mb =>
			mb.id === needle ||
			mb.displayName === needle,
		);
	}

	/**
	 * Gets the mention for this user
	 * @param {Discord.User} user Discord user
	 * @returns {string} In the form of `<@0123456789>`
	 * @static
	 */
	static getMention(user) {
		return `<@${user.id}>`;
	}

	/**
	 * Processes a Discord Message into a Message with context.
	 * @param {Discord.Message} message The Discord message without context
	 * @param {string} prefix The prefix of the command
	 * @returns {ContextMessage} Discord message with context
	 * @static
	 */
	static processMessage(message, prefix) {
		// Creates a message with context.
		const ctx = new ContextMessage(prefix, message.client);
		// Returns a shallow copy of the Discord message merged with the context.
		return Object.assign(ctx, message);
	}

	/**
	 * Tries to delete a message. Catches errors.
	 * @param {*} message Message to delete
	 * @async
	 */
	static async tryDelete(message) {
		try { await message.delete(); }
		catch (error) { console.error(error); }
	}
}

function whenMentionedOrPrefixed(prefixes, client) {
	if (!Array.isArray(prefixes)) return whenMentionedOrPrefixed([prefixes], client);
	const mention = Sebedius.getMention(client.user);
	prefixes.push(mention);
	return prefixes;
}

module.exports = Sebedius;