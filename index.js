const Discord = require('discord.js')
const client = new Discord.Client({
	disableMentions: "everyone",
})

var config = require('./config.json')

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`)
})

client.on('message', msg => {
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
			embed: {
				author: {
					name: `Suggestion from ${msg.member.displayName}`,
					url: "https://discordapp.com/users/" + msg.author.id,
					iconURL: msg.author.avatarURL(),
				},
				image: image,
				description: desc + click_through,
			}
		}).then(async newmsg => {

			msg.channel.send({
				embed: {
					author: {
						name: msg.member.displayName,
						iconURL: msg.author.avatarURL(),
					},
					description: `Your suggestion has been submitted!\nYou can downvote your own suggestion to remove it.\n[Click here to go to submission](${newmsg.url})`,
				}
			})

			await newmsg.react(config.eUpvote)
			newmsg.react(config.eDownvote)
		})
	}
})

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

		client.channels.cache.get(data.d.channel_id).messages.fetch(data.d.message_id).then( msg => {

			if (!msg.embeds || !msg.embeds[0]) {return}

			// Remove suggestion by downvoting
			if (data.d.emoji.id == config.eDownvote && msg.embeds[0].author) {
				if (msg.embeds[0].author.url == "https://discordapp.com/users/" + member_id) {
					msg.delete()
				}
			}

			// Accept / Deny
			// Permission 8 == administrator
			if ((!config.ownerIDs.includes(member_id) && ((member ? member.permissions : 0) & 8) == 0) || (data.d.emoji.name != config.eAccept && data.d.emoji.name != config.eDeny)) {return}

			let processed = client.channels.cache.get(config.processed)
			let embed = msg.embeds[0]
			let submit = client.channels.cache.get(config.submit)
			let accepted = data.d.emoji.name == config.eAccept

			embed.color = accepted ? 200 << 8 : 255 << 16
			embed.author.name = accepted ? "Accepted " + embed.author.name : "Denied " + embed.author.name

			let upvotes = msg.reactions.cache.find(msgrec => msgrec.emoji.id == config.eUpvote)
			let downvotes = msg.reactions.cache.find(msgrec => msgrec.emoji.id == config.eDownvote)

			embed.footer = {
				text: `${accepted ? "Accepted" : "Denied"} by ${data.d.member.nick || data.d.member.user.username} | Upvotes: ${upvotes ? upvotes.count - 1 : 0} | Downvotes: ${downvotes ? downvotes.count - 1 : 0}`
			}

			processed.send(embed).then(newmsg => {
				submit.send({
					content: `<@${embed.author.url.replace("https://discordapp.com/users/", "")}>`,
					embed: {
						color: accepted ? 200 << 8 : 255 << 16,
						title: accepted ? "Your suggestion was accepted!" : "Your suggestion was denied.",
						description: `\n**[Click here to see it](${newmsg.url})**`
					}
				})

				msg.delete()
			})

		}).catch(console.error)

	} catch(error) {
		console.error(error)
	}
})

client.login(config.token)
