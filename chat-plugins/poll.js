/*
* Poll chat plugin
* By bumbadadabum and Zarel.
*/

var permission = 'announce';

var Poll = (function () {
	function Poll(room, question, options) {
		if (room.pollNumber) {
			room.pollNumber++;
		} else {
			room.pollNumber = 1;
		}
		this.room = room;
		this.question = question;
		this.voters = new Set();
		this.totalVotes = 0;
		this.timeout = null;
		this.timeoutMins = 0;

		this.options = new Map();
		for (var i = 0; i < options.length; i++) {
			this.options.set(i + 1, {name: options[i], votes: 0});
		}
	}

	Poll.prototype.vote = function (user, option) {
		if (this.voters.has(user.latestIp)) {
			return user.sendTo(this.room, "Ya has votado en esta encuesta.");
		} else {
			this.voters.add(user.latestIp);
		}

		this.options.get(option).votes++;
		this.totalVotes++;

		this.update();
	};

	Poll.prototype.blankvote = function (user, option) {
		if (this.voters.has(user.latestIp)) {
			return user.sendTo(this.room, "You're already looking at the results.");
		} else {
			this.voters.add(user.latestIp);
		}

		this.update();
	};

	Poll.prototype.generateVotes = function () {
		var output = '<div class="infobox"><p style="margin: 2px 0 5px 0"><span style="border:1px solid #6A6;color:#484;border-radius:4px;padding:0 3px"><i class="fa fa-bar-chart"></i>Encuesta</span> <strong style="font-size:11pt">' + Tools.escapeHTML(this.question) + '</strong></p>';
		this.options.forEach(function (option, number) {
			output += '<div style="margin-top: 3px"><button value="/poll vote ' + number + '" name="send" title="Vote for ' + number + '. ' + Tools.escapeHTML(option.name) + '">' + number + '. <strong>' + Tools.escapeHTML(option.name) + '</strong></button></div>';
		});
		output += '</div>';

		return output;
	};

	Poll.prototype.generateResults = function (ended) {
		var icon = '<span style="border:1px solid #' + (ended ? '777;color:#555' : '6A6;color:#484') + ';border-radius:4px;padding:0 3px"><i class="fa fa-bar-chart"></i> ' + (ended ? "Encuesta Terminada" : "Encuesta") + '</span>';
		var output = '<div class="infobox"><p style="margin: 2px 0 5px 0">' + icon + ' <strong style="font-size:11pt">' + Tools.escapeHTML(this.question) + '</strong></p>';
		var iter = this.options.entries();

		var i = iter.next();
		var c = 0;
		var colors = ['#79A', '#8A8', '#88B'];
		while (!i.done) {
			var percentage = Math.round((i.value[1].votes * 100) / (this.totalVotes || 1));
			output += '<div style="margin-top: 3px">' + i.value[0] + '. <strong>' + Tools.escapeHTML(i.value[1].name) + '</strong> <small>(' + i.value[1].votes + ' vote' + (i.value[1].votes === 1 ? '' : 's') + ')</small><br /><span style="font-size:7pt;background:' + colors[c % 3] + ';padding-right:' + (percentage * 3) + 'px"></span><small>&nbsp;' + percentage + '%</small></div>';
			i = iter.next();
			c++;
		}
		output += '</div>';

		return output;
	};

	Poll.prototype.update = function () {
		var results = this.generateResults();

		// Update the poll results for everyone that has voted
		for (var i in this.room.users) {
			var user = this.room.users[i];
			if (this.voters.has(user.latestIp)) {
				user.sendTo(this.room, '|uhtmlchange|poll' + this.room.pollNumber +  '|' + results);
			}
		}
	};

	Poll.prototype.display = function (user, broadcast) {
		var votes = this.generateVotes();
		var results = this.generateResults();

		var target = {};

		if (broadcast) {
			target = this.room.users;
		} else {
			target[0] = user;
		}

		for (var i in target) {
			var thisUser = target[i];
			if (this.voters.has(thisUser.latestIp)) {
				thisUser.sendTo(this.room, '|uhtml|poll' + this.room.pollNumber +  '|' + results);
			} else {
				thisUser.sendTo(this.room, '|uhtml|poll' + this.room.pollNumber +  '|' + votes);
			}
		}
	};

	Poll.prototype.end = function () {
		var results = this.generateResults(true);

		this.room.send('|uhtmlchange|poll' + this.room.pollNumber +  '|<div class="infobox">La encuesta ha sido completada, ve mas abajo para ver los resultados</div>');
		this.room.send('|html|' + results);
	};

	return Poll;
})();

exports.commands = {
	poll: {
		create: 'new',
		new: function (target, room, user, connection, cmd, message) {
			if (target.length > 1024) return this.errorReply("Poll too long.");
			var params = target.split(target.includes('|') ? '|' : ',').map(function (param) { return param.trim(); });

			if (!this.can(permission, null, room)) return false;
			if (room.poll) return this.errorReply("There is already a poll in progress in this room.");

			if (params.length < 3) return this.errorReply("Not enough arguments for /poll new.");
			var options = [];

			for (var i = 1; i < params.length; i++) {
				options.push(params[i]);
			}

			if (options.length > 8) {
				return this.errorReply("Too many options for poll (maximum is 8).");
			}

			room.poll = new Poll(room, params[0], options);
			room.poll.display(user, true);

			this.logEntry("" + user.name + " used " + message);
			return this.privateModCommand("(La encuesta ha sido iniciada por " + user.name + ".)");
		},
		newhelp: ["/poll create [question], [option1], [option2], [...] - Creates a poll. Requires: % @ # & ~"],

		vote: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (!target) return this.errorReply("Please specify an option.");

			if (target === 'blank') {
				room.poll.blankvote(user);
				return;
			}

			var parsed = parseInt(target);
			if (isNaN(parsed)) return this.errorReply("To vote, specify the number of the option.");

			if (!room.poll.options.has(parsed)) return this.sendReply("Option not in poll.");

			room.poll.vote(user, parsed);
		},
		votehelp: ["/poll vote [number] - Votes for option [number]."],

		timer: function (target, room, user) {
			if (!room.poll) return this.errorReply("No hay encuestas en curso");

			if (target) {
				if (!this.can(permission, null, room)) return false;
				if (target === 'clear') {
					if (room.poll.timeout) {
						clearTimeout(room.poll.timeout);
						room.poll.timeout = null;
						room.poll.timeoutMins = 0;
						return room.add("El tiempo de espera para responder la encuesta se acabo.");
					} else {
						return this.errorReply("No timer to clear.");
					}
				}
				var timeout = parseFloat(target);
				if (isNaN(timeout) || timeout <= 0) return this.errorReply("Tiempo invalido.");
				if (room.poll.timeout) clearTimeout(room.poll.timeout);
				room.poll.timeoutMins = timeout;
				room.poll.timeout = setTimeout((function () {
					room.poll.end();
					delete room.poll;
				}), (timeout * 60000));
				room.add("El tiempo limite de la encuesta a sido establecido a " + timeout + " minutos.");
				return this.privateModCommand("(El tiempo limite de la encuesta a sido establecido a " + timeout + " minutos, por: " + user.name + ".)");
			} else {
				if (!this.canBroadcast()) return;
				if (room.poll.timeout) {
					return this.sendReply("El tiempo limite de la encuesta es " + room.poll.timeoutMins + " minutos.");
				} else {
					return this.sendReply("No hay tiempo limite en la encuesta");
				}
			}
		},
		timerhelp: ["/poll timer [minutos] - Establece un tiempo limite para la encuesta. Require: % @ # & ~", "/poll timer clear - Clears the poll's timer. Requires: % @ # & ~"],

		results: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");

			return room.poll.blankvote(user);
		},
		resultshelp: ["/poll results - Shows the results of the poll without voting. NOTE: you can't go back and vote after using this."],

		close: 'end',
		stop: 'end',
		end: function (target, room, user) {
			if (!this.can(permission, null, room)) return false;
			if (!room.poll) return this.errorReply("No hay encuestas en curso.");
			if (room.poll.timeout) clearTimeout(room.poll.timeout);

			room.poll.end();
			delete room.poll;
			return this.privateModCommand("(La encuesta ha sido terminada por " + user.name + ".)");
		},
		endhelp: ["/poll end - Ends a poll and displays the results. Requires: % @ # & ~"],

		show: 'display',
		display: function (target, room, user) {
			if (!room.poll) return this.errorReply("There is no poll running in this room.");
			if (!this.canBroadcast()) return;
			room.update();

			room.poll.display(user, this.broadcasting);
		},
		displayhelp: ["/poll display - Displays the poll"],

		'': function (target, room, user) {
			this.parse('/help poll');
		}
	},
	pollhelp: ["/poll Has una poll de cualqueir tema en el Servidor.",
				"Puedes utilizar los siguientes comandos:",
				"/poll create [pregunta], [opcion1], [opcion2], [...] - Crea una encuesta. Require: % @ # & ~",
				"/poll vote [numero] - Vota por la opcion [numero].",
				"/poll results -  Muestra los resultados de la encuesta sin votar NOTA: no se puede volver atrás y voto después de usar este..",
				"/poll timer [minutos] -  Establece la encuesta para terminar automáticamente después de [minutos]. Require: % @ # & ~",
				"/poll display - Muestra la encuesta",
				"/poll end - Termina la encuesta. Require: % @ # & ~"],


};
