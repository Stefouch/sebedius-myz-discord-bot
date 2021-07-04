const { emojifyRoll } = require('../Sebedius');
const YZRoll = require('../yearzero/YZRoll');
const { isNumber, resolveNumber, capitalize } = require('../utils/Util');
const RollTable = require('../utils/RollTable');
const ReactionMenu = require('../utils/ReactionMenu');
const { YZEmbed } = require('../utils/embeds');
const { __ } = require('../lang/locales');
const { YZWeapon } = require('../yearzero/YZObject');

module.exports = {
	name: 'attack',
	aliases: ['atk'],
	category: 'common',
	description: 'cattack-description',
	moreDescriptions: 'cattack-moredescriptions',
	guildOnly: false,
	args: true,
	usage: '[game] <monster name> [number] [-private|-p] [-lang <language_code>]',
	async run(args, ctx) {
		const { monster, argv } = await ctx.bot.commands.get('monster').parse(args, ctx);
		const ref = isNumber(argv.attack) ? argv.attack : null;
		const successIcon = ctx.bot.config.commands.roll.options[monster.game].successIcon || 'success';
		const attack = monster.getAttack(ref);
		let effect = attack.effect
			.replace(/~success/gi, successIcon)
			.replace(/~/g, monster.name)
			.replace(/\\n/g, '\n');

		// If there are some relevant attributes,
		// let's add those dice to the description of the effect.
		if (
			attack.base != null &&
			(monster.str || monster.agi) &&
			!/\(\d+\)/.test(attack.base)
		) {
			const atkDice = attack.ranged
				? monster.agi + (monster.skills.shoot || 0)
				: monster.str + (monster.skills.fight || 0);

			if (attack instanceof YZWeapon && atkDice > 0) {
				let str;
				if (attack.base > 0) {
					const w = Math.ceil(Math.log10(attack.base));
					str = `__**${atkDice + attack.base}** `;
					effect = str.concat(capitalize(effect.slice(w + 12 + 1)));
				}
				else {
					str = `__**${atkDice}** Dice${attack.damage ? ', ' : ''}`;
					effect = str.concat(effect.slice(2));
				}
			}
		}

		// Creates the Embed.
		const embed = new YZEmbed(
			`:crossed_swords: **${monster.name}**${__('possessives', monster.lang)} ${__('attack', monster.lang)}`,
			`${attack.name ? `**${attack.name}:** ` : ''} ${effect}`,
		);
		// Sets the footer of the embed (roll reference).
		let footer;
		if (monster.attacks instanceof RollTable) {
			let refStr;
			if (typeof ref === 'string' && (ref.startsWith('+') || ref.startsWith('-'))) {
				refStr = `${attack.ref} (${ref})`;
			}
			else {
				refStr = attack.ref;
			}
			footer = `[${refStr}] → ${monster.attacks.name.split('.')[0]}`;
		}
		else if (ref) {
			footer = `Ref: [${ref}]`;
		}
		if (footer) embed.setFooter(footer);

		// Sends the message.
		let message;
		if (argv.private) message = await ctx.author.send(embed);
		else message = await ctx.send(embed);

		// Adds a Reaction Menu to roll the dice of the attack.
		if (attack.base || attack.damage || attack.crit || attack.attackAsFighter) {
			const reactions = [];
			if (attack.base || attack.damage || attack.attackAsFighter) {
				reactions.push({
					icon: '⚔️',
					owner: ctx.author.id,
					fn: () => rollAttack(attack, monster, message, ctx.bot),
				});
			}
			if (attack.crit) {
				const [num, table] = attack.crit.split(' ');
				reactions.push({
					icon: '☠️',
					owner: ctx.author.id,
					fn: () => rollCrit(monster.game, table, num, argv.private, ctx),
				});
			}
			reactions.push({
				icon: '❌',
				owner: ctx.author.id,
				fn: collector => collector.stop(),
			});
			const cooldown = ctx.bot.config.commands.roll.pushCooldown;
			const rm = new ReactionMenu(message, cooldown, reactions);
		}
		// console.log(monster);
		// console.log(attack);
	},
};

/**
 * Rolls the dice of an attack.
 * @param {YZAttack} attack A Year Zero attack
 * @param {YZMonster} monster The monster that used the attack
 * @param {Discord.Message} message Discord message
 * @param {Discord.Client} bot The bot's client
 * @async
 */
async function rollAttack(attack, monster, message, bot) {
	const game = monster.game;
	// Rolls the attack.
	//const atkRoll = new YZRoll(game, message.author, attack.name);
	const atkRoll = YZRoll.parse(
		monster.getRollPhrase(attack),
		game,
		message.author,
		attack.name,
	);

/*	if (/\(\d+\)/.test(attack.base)) {
		// Fixed roll (only Base dice).
		atkRoll.addBaseDice(Util.resolveNumber(attack.base));
	}
	else {
		// Unfixed roll.
		atkRoll.addBaseDice(attack.ranged ? monster.agi : monster.str);
		atkRoll.addSkillDice(attack.ranged ? monster.skills.shoot : monster.skills.fight);
		atkRoll.addGearDice(attack.base);
	}//*/

	// Calculates damages.
	const hit = atkRoll.successCount;
	let damage;
	// No damage if undefined
	if (attack.damage === undefined || attack.damage === null) {
		damage = 0;
	}
	else if (hit > 0) {
		// Fixed damage
		if (/\(\d+\)/.test(attack.damage)) {
			damage = resolveNumber(attack.damage);
		}
		// Regular damage
		else {
			damage = +attack.damage + hit - 1;
		}
	}
	else {
		damage = 0;
	}

	// Sends the message.
	await message.channel.send(
		emojifyRoll(atkRoll, bot.config.commands.roll.options[game], true),
		damage
			? new YZEmbed(`${__('damage', monster.lang)} × ${damage}`, ':boom:'.repeat(damage))
			: null,
	);
}

/**
 * Rolls a crit of an attack.
 * @param {string} game The code of the game used
 * @param {?string} table Crit damage type
 * @param {?number} num The reference of the crit, if any
 * @param {?boolean} privacy Whether the message is private
 * @param {Discord.Message} ctx Discord message with context
 * @async
 */
async function rollCrit(game, table, num, privacy, ctx) {
	const args = [game, table, num];
	if (privacy) args.push('-p');
	return await ctx.bot.commands.get('crit').run(args, ctx);
}