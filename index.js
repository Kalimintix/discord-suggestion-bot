const Discord = require('discord.js')
const Intents = Discord.Intents
const intents = new Intents([Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS])
const client = new Discord.Client({
	disableMentions: "everyone",
	intents: intents
})

var config = require('./config.json')

const Trello = require("node-trello")
var trello = new Trello(config.trello_apikey, config.trello_token)


client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`)
})

client.on('messageCreate', msg => {
	if (!msg.guild || !msg.guild.id == config.guild) {return}

	if (config.submit == msg.channel.id && msg.content.replace(/–/g, "-").replace(/—/g, "-").startsWith(config.suggestion_prefix)) {
		let processing = client.channels.cache.get(config.processing)
		let image = {}
		let desc = msg.content.substr(config.suggestion_prefix.length, msg.content.length).trim()
		let click_through = `\n[Click here to go to submission](${msg.url})`
		if (desc.length <= 3) {return}

		for ([key, value] of msg.attachments) {
			if (!image.url) {
				image.url = value.url
			} else {
				desc += "\n" + value.url
				click_through = `\n**[Click here to go to submission](${msg.url})**`
			}

		}
		processing.send({
			embeds: [{
				author: {
					name: `Suggestion from ${msg.member.displayName}`,
					url: "https://discordapp.com/users/" + msg.author.id,
					iconURL: msg.author.avatarURL(),
				},
				image: image,
				description: desc + click_through,
			}]
		}).then(async newmsg => {

			msg.channel.send({
				embeds: [{
					author: {
						name: msg.member.displayName,
						iconURL: msg.author.avatarURL(),
					},
					description: `Your suggestion has been submitted!\nYou can downvote your own suggestion to remove it.\n[Click here to go to submission](${newmsg.url})`,
				}]
			})

			await newmsg.react(config.eUpvote)
			newmsg.react(config.eDownvote)
		})
	}
})

function PostCard(name, suggestion) {
	return new Promise((resolve, reject) => {
		trello.post("/1/cards", {name: name, idList: config.trello_category, idLabels: [config.trello_label], desc: suggestion}, resolve, reject)
	})
}

// Handle Suggestion Reactions
client.on('raw', async data => {
	if (!data.t || !data.d || !data.d.guild_id || data.t != "MESSAGE_REACTION_ADD") {return}
	try {
		if (data.d.channel_id != config.processing || !data.d.member || data.d.member.user.id == client.user.id) {return}
		let member_id = data.d.member.user.id
		let member
		try {
			member = await client.guilds.cache.get(data.d.guild_id).members.fetch(member_id)
		} catch (error) { console.log(error) }

		client.channels.cache.get(data.d.channel_id).messages.fetch(data.d.message_id).then(async msg => {

			if (!msg.embeds || !msg.embeds[0]) {return}

			// Remove suggestion by downvoting
			if (data.d.emoji.id == config.eDownvote && msg.embeds[0].author) {
				if (msg.embeds[0].author.url == "https://discordapp.com/users/" + member_id) {
					msg.delete()
				}
			}

			// Accept / Deny
			// Permission 8 == administrator
			if ((!config.ownerIDs.includes(member_id) && ((member ? member.permissions : 0n) & 8n) == 0n) || (data.d.emoji.name != config.eAccept && data.d.emoji.name != config.eDeny && data.d.emoji.name != config.eAcceptTrello)) {return}

			let processed = client.channels.cache.get(config.processed)
			let embed = msg.embeds[0]
			let submit = client.channels.cache.get(config.submit)
			let accepted = data.d.emoji.name == config.eAccept || data.d.emoji.name == config.eAcceptTrello

			var card
			if (config.enableTrello && data.d.emoji.name == config.eAcceptTrello) {
				card = await PostCard(embed.author.name, embed.description)
				if (card === null) {
					embed.description += `\n[Sent to Trello](${config.trello_url})`
				} else {
					console.log(card)
				}
			}

			embed.color = accepted ? 200 << 8 : 255 << 16
			embed.author.name = accepted ? "Accepted " + embed.author.name : "Denied " + embed.author.name

			let upvotes = msg.reactions.cache.find(msgrec => msgrec.emoji.id == config.eUpvote)
			let downvotes = msg.reactions.cache.find(msgrec => msgrec.emoji.id == config.eDownvote)

			embed.footer = {
				text: `${accepted ? "Accepted" : "Denied"} by ${data.d.member.nick || data.d.member.user.username} | Upvotes: ${upvotes ? upvotes.count - 1 : 0} | Downvotes: ${downvotes ? downvotes.count - 1 : 0}`
			}

			processed.send({embeds: [embed]}).then(newmsg => {
				submit.send({
					content: `<@${embed.author.url.replace("https://discordapp.com/users/", "")}>`,
					embeds: [{
						color: accepted ? 200 << 8 : 255 << 16,
						title: accepted ? "Your suggestion was accepted!" : "Your suggestion was denied.",
						description: `\n**[Click here to see it](${newmsg.url})**`
					}]
				})

				msg.delete()
			})

		}).catch(console.error)

	} catch(error) {
		console.error(error)
	}
})

client.login(config.token)
