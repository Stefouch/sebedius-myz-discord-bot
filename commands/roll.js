const { emojifyRoll, checkPermissions } = require('../Sebedius');
const YZRoll = require('../yearzero/YZRoll');
const { trimString } = require('../utils/Util');
const { YZEmbed } = require('../utils/embeds');
const ReactionMenu = require('../utils/ReactionMenu');
const { DICE_ICONS, SUPPORTED_GAMES } = require('../utils/constants');
const { TooManyDiceError } = require('../utils/errors');
const YargsParser = require('yargs-parser');
const { __ } = require('../lang/locales');

const DICE_RANGE_ICONS = {
	'6': DICE_ICONS.generic.d6,
	'8': DICE_ICONS.generic.d8,
	'10': DICE_ICONS.generic.d10,
	'12': DICE_ICONS.generic.d12,
};

module.exports = {
	name: 'roll',
	aliases: ['r'],
	category: 'common',
	description: 'croll-description',
	moreDescriptions: 'croll-moredescriptions',
	guildOnly: false,
	args: true,
	usage: '[game] <dice...> [arguments...] [-lang <language_code>]',
	async run(args, ctx) {
		// Changes '#' with '-name'.
		const hashTagIndex = args.indexOf('#');
		if (~hashTagIndex && !args.some(arg => /^(-#|-n|-name)$/.test(arg))) {
			args.splice(hashTagIndex, 1, '-name');
		}
		// Parsing arguments. See https://www.npmjs.com/package/yargs-parser#api for details.
		const rollargv = YargsParser(args, {
			boolean: ['fullauto', 'nerves', 'pride'],
			number: ['push', 'minpanic', 'mod'],
			array: ['name'],
			string: ['lang'],
			alias: {
				push: ['p', 'pushes'],
				name: ['n', '#'],
				fullauto: ['f', 'fa', 'full-auto'],
				nerves: ['nerve'],
				lang: ['lng', 'language'],
			},
			default: {
				fullauto: false,
				nerves: false,
				minpanic: 0,
				mod: 0,
				push: 1,
				lang: null,
			},
			configuration: ctx.bot.config.yargs,
		});
		const lang = await ctx.bot.getValidLanguageCode(rollargv.lang, ctx);
		const name = rollargv.name
			? trimString(rollargv.name.join(' '), 100)
			: undefined;

		// Sets the game. Must be done first.
		let game;
		if (SUPPORTED_GAMES.includes(rollargv._[0])) game = rollargv._.shift();
		else game = await ctx.bot.getGame(ctx, 'myz');

		// Creates the roll.
		let roll = new YZRoll(game, ctx.author, name, lang);

		// Year Zero Roll Regular Expression.
		const yzRollRegex = /^((\d{1,2}[dbsgna])|([bsgna]\d{1,2})|(d(6|8|10|12))|([abcd])+)+$/i;

		// Checks for d6, d66 & d666.
		const isD66 = rollargv._.length === 1 &&
			(
				(/^d6{1,3}$/i.test(rollargv._[0]) && game !== 't2k') ||
				(/^d6{2,3}$/i.test(rollargv._[0]) && game === 't2k')
			);
		if (isD66) {
			if (ctx.bot.config.commands.roll.options[game].hasBlankDice) {
				roll.setGame('generic');
			}
			const skillQty = (rollargv._[0].match(/6/g) || []).length;
			roll.setName(`${rollargv._[0].toUpperCase()}${name ? ` (${name})` : ''}`);
			roll.addSkillDice(skillQty);
			roll.maxPush = 0;

			// Forces d66/d666 Embed. Unofficial YZRoll's property.
			roll.d66 = true;
		}
		// If not, checks if the first argument is a YZ roll phrase.
		else if (yzRollRegex.test(rollargv._[0])) {
			// Creates the roll's name.
			if (name) {
				roll.setName(`${name}${rollargv.fullauto ? ` *(${__('fullauto', lang)})*` : ''}`);
			}

			// Then, processes all uncategorized arguments.
			for (const arg of rollargv._) {
				// Checks if it's a classic YZ roll phrase.
				if (/^((\d{1,2}[dbsgna])|([bsgna]\d{1,2}))+$/i.test(arg)) {

					// If true, the roll phrase is then splitted in digit-letter or letter-digit couples.
					const diceCouples = arg.match(/(\d{1,2}[dbsgna])|([bsgna]\d{1,2})/gi);

					for (const dieCouple of diceCouples) {

						// Then, each couple is splitted in an array with the digit and the letter.
						const couple = dieCouple.match(/\d{1,2}|[dbsgna]/gi);

						// Sorts numbers (dice quantity) in first position.
						couple.sort();

						const diceQty = Number(couple[0]) || 1;
						const dieTypeChar = couple[1].toLowerCase();

						// For the chosen letter, we assign a die type.
						let type;
						switch (dieTypeChar) {
							case 'b': type = 'base'; break;
							case 'd':
								if (game === 'alien') type = 'base';
								else if (game === 't2k') type = 'ammo';
								else type = 'skill';
								break;
							case 's': type = 'skill'; break;
							case 'g': type = 'gear'; break;
							case 'n': type = 'neg'; break;
							case 'a':
								if (game === 't2k') type = 'ammo';
								else roll.addDice('arto', 1, diceQty);
								break;
						}

						if (type) {
							// First, checks if there are some type swap (see config roll aliases).
							const diceOptions = ctx.bot.config.commands.roll.options[game].alias;
							if (diceOptions) {
								if (diceOptions.hasOwnProperty(type)) type = diceOptions[type];
							}
							// Then adds the dice.
							// Type "--" means to skip.
							if (type !== '--') roll.addDice(type, diceQty);
						}
					}
				}
				// Checks if it's a Twilight 2000 roll phrase.
				else if (/^((d(6|8|10|12))|([abcd]+))+$/i.test(arg)) {
					const diceCouples = arg.match(/(d(?:6|8|10|12))|([abcd])/gi);

					for (const dieCouple of diceCouples) {

						switch (dieCouple.toLowerCase()) {
							case 'd6':
							case 'd':
								// similar logic to if it's a classic YZ roll phrase, just with t2k first.
								if (game === 't2k') roll.addBaseDice(1);
								// Everything else should be skill dice, even alien's base gets converted to skill on a classic YZ roll phrase
								else roll.addSkillDice(1);
								break;
							case 'd8':
							case 'c':
								if (game === 't2k') roll.addDice('base', 1, 8);
								else roll.addDice('arto', 1, 8);
								break;
							case 'd10':
							case 'b':
								if (game === 't2k') roll.addDice('base', 1, 10);
								else roll.addDice('arto', 1, 10);
								break;
							case 'd12':
							case 'a':
								if (game === 't2k') roll.addDice('base', 1, 12);
								else roll.addDice('arto', 1, 12);
								break;
						}
					}
				}
				// Checks if it's a modifier.
				//TODO: '-1' unsupported arg due to Issue in Yargs Parser
				else if (/^[+-]\d+$/.test(arg)) {
					roll.modify(+arg);
				}
			}
			// Adds extra Artifact Dice.
			// 1) Forbidden Lands' Pride.
			if (rollargv.pride || rollargv._.includes('pride')) roll.addDice('arto', 1, 12);
		}
		// Checks for init roll.
		else if (/initiative|init/i.test(rollargv._[0])) {
			if (ctx.bot.config.commands.roll.options[game].hasBlankDice) {
				roll.setGame('generic');
			}
			roll.setName(`${__('initiative', roll.lang)}${name ? ` (${name})` : ''}`)
				.addSkillDice(1)
				.maxPush = 0;

			// Forces Init Roll Embed. Unofficial YZRoll's property.
			roll.initiative = true;
		}
		// Checks if PRIDE roll alone.
		else if (rollargv.pride || rollargv._.includes('pride')) {
			roll.setGame('fbl')
				.setName(`${__('pride', roll.lang)}${name ? ` (${name})` : ''}`)
				.addDice('arto', 1, 12);
		}
		// Checks for generic rolls.
		else if (/\d?[dD]\d?/.test(rollargv._[0])) {
			const formula = rollargv._.join('');
			game = 'generic';
			roll = YZRoll.parse(formula, game, ctx.author, `${name ? `${name}\n` : ''}${formula}`);
			roll.maxPush = 0;
		}
		// Exits if no dice pattern were found.
		else {
			return ctx.reply(`ℹ️ ${__('croll-invalid-syntax', lang).replace('will_be_replaced', ctx.prefix)}`);
		}

		// Checks for number of pushes or Full-Auto (unlimited pushes).
		if (rollargv.fullauto) {
			roll.setFullAuto(true);
		}
		else if (rollargv.push !== 1) {
			roll.maxPush = Number(rollargv.push);
		}

		// Applies extra modifiers.
		if (rollargv.mod) {
			roll.modify(+rollargv.mod);
		}
		//Temporary Yargs Parser issue fix.
		Object.keys(rollargv).forEach(k => {
			if (/\d+/.test(k)) roll.modify(-k);
		});

		// Nerves of Steel talent. Unofficial YZRoll's property.
		if (rollargv.nerves) roll.nerves = true;
		if (rollargv.minpanic) roll.minpanic = rollargv.minpanic;

		// Logs and Roll.
		console.log(roll.toString());

		// Validations.
		// Aborts if too many dice.
		if (roll.size > ctx.bot.config.commands.roll.max) {
			throw new TooManyDiceError(roll.size);
		}
		// Aborts if no dice.
		if (roll.size < 1) {
			return ctx.reply(`❌ ${__('croll-no-dice', lang)}`);
		}

		// Sends the message.
		if (roll.d66) {
			await ctx.send(
				emojifyRoll(roll, ctx.bot.config.commands.roll.options[roll.game]),
				getEmbedD66Results(roll, ctx),
			);
		}
		else if (roll.initiative) {
			await ctx.send(
				emojifyRoll(roll, ctx.bot.config.commands.roll.options[roll.game]),
				getEmbedInitRollResults(roll, ctx),
			);
		}
		else if (roll.game === 'generic') {
			await ctx.send(getEmbedGenericDiceResults(roll, ctx));
		}
		else {
			await messageRollResult(roll, ctx);
		}

		// Returns the roll.
		return roll;
	},
};

/**
 * Sends a message with the roll result.
 * @param {YZRoll} roll The Roll
 * @param {Discord.Message} ctx The Triggering Message with context
 * @async
 */
async function messageRollResult(roll, ctx) {
	// Aborts if the bot doesn't have the needed permissions.
	if (!await checkPermissions(ctx, null, roll.lang)) return;

	// OPTIONS
	// Important for all below.
	const userId = ctx.author.id;
	const pushIcon = ctx.bot.config.commands.roll.pushIcon;
	const gameOptions = ctx.bot.config.commands.roll.options[roll.game];

	// Sends the message.
	await ctx.send(
		emojifyRoll(roll, gameOptions),
		getEmbedDiceResults(roll, ctx, gameOptions),
	)
		.then(rollMessage => {
			// Detects PANIC.
			if (gameOptions.panic && roll.panic) {
				const panicArgs = [roll.stress];
				if (roll.nerves) panicArgs.push('-nerves');
				if (roll.minpanic) panicArgs.push('-min', roll.minpanic);
				return ctx.bot.commands.get('panic').run(panicArgs, ctx);
			}
			if (roll.pushable) {
				// Creates an array of objects containing the required information
				// for the Reaction Menu.
				const reactions = [
					{
						icon: pushIcon,
						owner: userId,
						fn: collector => messagePushEdit(collector, ctx, rollMessage, roll, gameOptions),
					},
				];
				// Adds extra reactions from the config options.
				if (gameOptions.reactionMenu) {
					for (const reac of gameOptions.reactionMenu) {
						reactions.push({
							icon: reac.icon,
							owner: userId,
							fn: collector => {
								const gopts = Object.assign({}, gameOptions);
								gopts.extraPushDice = reac.extraPushDice;
								messagePushEdit(collector, ctx, rollMessage, roll, gopts);
							},
						});
					}
				}
				// Adds the stop reaction.
				reactions.push({
					icon: '❌',
					owner: userId,
					fn: collector => collector.stop(),
				});
				// Starts the Reaction Menu.
				const cooldown = ctx.bot.config.commands.roll.pushCooldown;
				const rm = new ReactionMenu(rollMessage, cooldown, reactions);
			}
		})
		.catch(console.error);
}

/**
 * Edits the message when the roll is pushed.
 * @param {Discord.ReactionCollector} collector Discord Reaction Collector
 * @param {Discord.Message} ctx The triggering message with context
 * @param {Discord.Message} rollMessage The roll message
 * @param {YZRoll} roll The roll object
 * @param {Object} gameOptions client.config.commands.roll.[game]
 */
function messagePushEdit(collector, ctx, rollMessage, roll, gameOptions) {
	// Pushes the roll.
	const pushedRoll = roll.push();

	// Detects additional dice from pushing.
	if (gameOptions.extraPushDice) {
		for (const extra of gameOptions.extraPushDice) {
			pushedRoll.addDice(extra, 1);
		}
	}
	// Logs.
	console.log(pushedRoll.toString());

	// Aborts if too many dice.
	if (pushedRoll.size > ctx.bot.config.commands.roll.max) {
		// throw new TooManyDiceError(pushedRoll.size);
		// Cannot use error throwing because this function will not be catched by bot.js's error management.
		collector.stop();
		return ctx.reply(`⚠️ ${__('croll-too-many-dice', roll.lang)} (${pushedRoll.size})`);
	}

	// Stops the collector if it's the last push.
	if (!roll.pushable) collector.stop();

	// Edits the roll result embed message.
	if (!rollMessage.deleted) {
		rollMessage.edit(
			emojifyRoll(pushedRoll, gameOptions),
			getEmbedDiceResults(pushedRoll, ctx, gameOptions),
		)
			.catch(console.error);
	}
	// Detects PANIC.
	if (gameOptions.panic && pushedRoll.panic) {
		collector.stop();
		const panicArgs = [pushedRoll.stress];
		if (roll.nerves) panicArgs.push('-nerves');
		return ctx.bot.commands.get('panic').run(panicArgs, ctx);
	}
}

/**
 * Gets an Embed with the dice results and the author's name.
 * @param {YZRoll} roll The 'Roll' Object
 * @param {Discord.Message} ctx The triggering message with context
 * @param {Object} opts Options of the roll command
 * @returns {Discord.MessageEmbed} A Discord Embed Object
 */
function getEmbedDiceResults(roll, ctx, opts) {
	const s = roll.successCount;
	let desc = `${__(s > 1 ? 'successes' : 'success', roll.lang)}: **${s}**`;

	if (opts.trauma && roll.count('base')) {
		const n = roll.attributeTrauma;
		desc += `\n${__(n > 1 ? 'traumas' : 'trauma', roll.lang)}: **${n}**`;
	}
	if (opts.gearDamage && roll.count('gear')) {
		desc += `\n${__('gear-damage', roll.lang)}: **${roll.gearDamage}**`;
	}
	if (roll.rof > 0) {
		const n = roll.count('ammo', 6);
		if (n > 0) {
			desc += `\n${__(s > 0 ? (n > 1 ? 'extra-hits' : 'extra-hit') : (n > 1 ? 'suppressions' : 'suppression'), roll.lang)}: **${n}**`;
		}
		desc += `\n${__('croll-ammo-spent', roll.lang)}: **${roll.sum('ammo')}**`;
	}
	if (opts.mishap && roll.mishap) {
		desc += `\n**${__('mishap', roll.lang).toUpperCase()}** 💢`;
	}
	if (opts.panic && roll.panic) {
		desc += `\n**${__('panic', roll.lang).toUpperCase()}!!!**`;
	}

	const embed = new YZEmbed(roll.name, desc, ctx, true);

	if (opts.detailed) {
		let results = '';
		for (const type of YZRoll.DIE_TYPES) {
			const dice = roll.getDice(type);
			if (dice.length) {
				const diceResults = dice.map(d => d.result);
				results += ` → [${type}]: ${diceResults.join(', ')}\n`;
			}
		}
		if (roll.pushed) {
			for (const type of YZRoll.DIE_TYPES) {
				const dice = roll.getDice(type);
				if (dice.length) {
					for (let p = roll.pushCount; p > 0; p--) {
						const diceResults = dice
							.filter(d => roll.pushCount - d.pushCount < p)
							.map(d => d.previousResults[d.pushCount - (roll.pushCount - p) - 1]);
						results += `#${p} [${type}]: ${diceResults.join(', ')}\n`;
					}
				}
			}
		}
		if (results) embed.addField(__('details', roll.lang), '```php\n' + results + '\n```', false);
	}

	if (roll.pushed) embed.setFooter(`${(roll.pushCount > 1) ? `${roll.pushCount}× ` : ''}${__('pushed', roll.lang)}`);

	return embed;
}

/**
 * Gets an Embed for the __generic__ dice results.
 * @param {YZRoll} roll The 'Roll' Object
 * @param {Discord.Message} ctx The triggering message with context
 * @returns {Discord.MessageEmbed} A Discord Embed Object
 */
function getEmbedGenericDiceResults(roll, ctx) {
	const result = `${roll.name} = __**${roll.sum()}**__`;
	const details = roll.dice.reduce((acc, d) => {
		acc += ` ${d.operator} `;
		if (d.type !== 'modifier') {
			return acc + `${DICE_RANGE_ICONS[d.range] || `\`D${d.range}\``} (${d.result})`;
		}
		else {
			return acc + `\` ${d.result} \``;
		}
	}, '');
	const embed = new YZEmbed(
		result,
		roll.size > 1 ? details.slice(3).replace(/-/g, '−') : undefined,
		ctx,
		true,
	);
	embed.setFooter(__('croll-generic-roll', roll.lang));
	return embed;
}

/**
 * Gets an Embed with the __generic__ dice results and the author's name.
 * @param {YZRoll} roll The 'Roll' Object
 * @param {Discord.Message} ctx The triggering message with context
 * @returns {Discord.MessageEmbed} A Discord Embed Object
 */
function getEmbedD66Results(roll, ctx) {
	const embed = new YZEmbed(
		`${roll.name} = __**${roll.baseSix('skill')}**__`,
		undefined,
		ctx,
		true,
	);
	embed.setFooter(__('croll-single-roll', roll.lang));
	return embed;
}

/**
 * Gets an Embed for the __Init Roll__ dice results.
 * @param {YZRoll} roll The 'Roll' Object
 * @param {Discord.Message} ctx The triggering message with context
 * @returns {Discord.MessageEmbed} A Discord Embed Object
 */
function getEmbedInitRollResults(roll, ctx) {
	const embed = new YZEmbed(
		roll.name,
		'```\n' + roll.sum() + '\n```',
		ctx,
		true,
	);
	// embed.setFooter('Initiative Roll');
	return embed;
}