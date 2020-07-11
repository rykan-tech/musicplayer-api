/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const requestAudio = function (path, callback) {
	const request = new XMLHttpRequest;
	// Async request
	request.open('GET', path, true);
	request.responseType = 'arraybuffer';
	request.onload = function () {
		const audioData = request.response;
		return callback(audioData);
	};
	return request.send();
};

class MusicTrack {
	paused: boolean;
	stopped: boolean;
	soundStart: number;
	pauseOffset: number;
	
	player;
	public path: string;
	onended;
	onloaded;

	buffer;

	source;

	constructor(player, path, onended, onloaded) {
		this.player = player;
		this.path = path;
		this.onended = onended;
		this.onloaded = onloaded;
		this.paused = false;
		this.stopped = true;
		this.soundStart = 0;
		this.pauseOffset = 0;
		requestAudio(this.path, audioData => {
			return this.player.ctx.decodeAudioData(audioData, decodedData => {
				this.buffer = decodedData;
				this.onloaded();
				return this.initializeSource();
			});
		});
	}

	initializeSource() {
		this.source = this.player.ctx.createBufferSource();
		this.source.connect(this.player.gainNode);
		this.source.buffer = this.buffer;
		return this.source.onended = this.onended;
	}

	play() {
		if (!this.paused && this.stopped) {
			this.soundStart = Date.now();
			this.source.onended = this.onended;
			this.source.start();
			return this.stopped = false;
		} else if (this.paused) {
			this.paused = false;
			this.source.onended = this.onended;
			return this.source.start(0, this.pauseOffset / 1000);
		}
	}

	stop() {
		if (!this.stopped) {
			this.source.onended = null;
			this.source.stop();
			this.stopped = true;
			this.paused = false;
			return this.initializeSource();
		}
	}

	pause() {
		if (!this.paused && !this.stopped) {
			this.pauseOffset = Date.now() - this.soundStart;
			this.paused = true;
			this.source.onended = null;
			this.source.stop();
			return this.initializeSource();
		}
	}

	getDuration() {
		return this.buffer.duration;
	}

	getPosition() {
		if (this.paused) {
			return this.pauseOffset / 1000;
		} else if (this.stopped) {
			return 0;
		} else {
			return (Date.now() - this.soundStart) / 1000;
		}
	}

	setPosition(position) {
		if (position < this.buffer.duration) {
			if (this.paused) {
				return this.pauseOffset = position;
			} else if (this.stopped) {
				this.stopped = false;
				this.soundStart = Date.now() - (position * 1000);
				this.source.onended = this.onended;
				return this.source.start(0, position);
			} else {
				this.source.onended = null;
				this.source.stop();
				this.initializeSource();
				this.soundStart = Date.now() - (position * 1000);
				return this.source.start(0, position);
			}
		} else {
			throw new Error("Cannot play further than the end of the track");
		}
	}
}

class MusicPlayer {
	playlist: MusicTrack[];
	muted: boolean;

	ctx: AudioContext;
	gainNode: GainNode;
	previousGain: number;

	////////////
	// Events //
	////////////

	onSongFinished(path) {
		return undefined;
	}

	onPlaylistEnded() {
		return undefined;
	}

	onPlayerStopped() {
		return undefined;
	}

	onPlayerPaused() {
		return undefined;
	}

	onTrackLoaded(path) {
		return undefined;
	}

	onTrackAdded(path) {
		return undefined;
	}

	onTrackRemoved(path) {
		return undefined;
	}

	onVolumeChanged(value) {
		return undefined;
	}

	onMuted() {
		return undefined;
	}

	onUnmuted() {
		return undefined;
	}

	constructor() {
		this.ctx = new (window.AudioContext);
		this.gainNode = this.ctx.createGain();
		this.gainNode.connect(this.ctx.destination);
		this.previousGain = this.gainNode.gain.value;
		this.playlist = [];
		this.muted = false;
	}

	setVolume(value) {
		this.gainNode.gain.value = value;
		return this.onVolumeChanged(value);
	}

	getVolume() {
		return this.gainNode.gain.value;
	}

	toggleMute() {
		if (this.muted) {
			this.muted = false;
			this.gainNode.gain.value = this.previousGain;
			return this.onUnmuted();
		} else {
			this.previousGain = this.gainNode.gain.value;
			this.gainNode.gain.value = 0;
			this.muted = true;
			return this.onMuted();
		}
	}

	pause() {
		if (this.playlist.length !== 0) {
			this.playlist[0].pause();
			return this.onPlayerPaused();
		}
	}

	stop() {
		if (this.playlist.length !== 0) {
			this.playlist[0].stop();
			return this.onPlayerStopped();
		}
	}

	play() {
		if (this.playlist.length !== 0) {
			return this.playlist[0].play();
		}
	}

	playNext() {
		if (this.playlist.length !== 0) {
			this.playlist[0].stop();
			this.playlist.shift();
			if (this.playlist.length === 0) {
				return this.onPlaylistEnded();
			} else {
				return this.playlist[0].play();
			}
		}
	}

	addTrack(path) {
		const finishedCallback = () => {
			this.onSongFinished(path);
			return this.playNext();
		};

		const loadedCallback = () => {
			return this.onTrackLoaded(path);
		};

		return this.playlist.push(new MusicTrack(this, path, finishedCallback, loadedCallback));
	}

	insertTrack(index, path) {
		const finishedCallback = () => {
			this.onSongFinished(path);
			return this.playNext();
		};

		const loadedCallback = () => {
			return this.onTrackLoaded(path);
		};

		return this.playlist.splice(index, 0,
			new MusicTrack(this, path, finishedCallback, loadedCallback));
	}

	removeTrack(index) {
		const song = this.playlist.splice(index, 1)[0];
		return this.onTrackRemoved(song.path);
	}

	replaceTrack(index, path) {
		const finishedCallback = () => {
			this.onSongFinished(path);
			return this.playNext();
		};

		const loadedCallback = () => {
			return this.onTrackLoaded(path);
		};

		const newTrack = new MusicTrack(this, path, finishedCallback, loadedCallback);
		const oldTrack = this.playlist.splice(index, 1, newTrack)[0];
		return this.onTrackRemoved(oldTrack.path);
	}

	getSongDuration(index) {
		if (this.playlist.length === 0) {
			return 0;
		} else {
			if (index != null) {
				return (this.playlist[index] != null ? this.playlist[index].getDuration() : undefined);
			} else {
				return this.playlist[0].getDuration();
			}
		}
	}

	getSongPosition() {
		if (this.playlist.length === 0) {
			return 0;
		} else {
			return this.playlist[0].getPosition();
		}
	}

	setSongPosition(value) {
		if (this.playlist.length !== 0) {
			return this.playlist[0].setPosition(value);
		}
	}

	removeAllTracks() {
		let playlist;
		this.stop();
		return playlist = [];
	}
}

// exports.MusicPlayer = MusicPlayer;

export {
	MusicPlayer
};