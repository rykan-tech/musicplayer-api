/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

import { EventEmitter } from "events";

const requestAudio = function (path: string, callback: (audioData: ArrayBuffer) => any) {
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

const fetchAudio = async (path: string, callback: (audioData: ArrayBuffer) => any) => {
	const request = await fetch(path, {
		method: "GET",
	});
	callback(await request.arrayBuffer());
};

class MusicTrack {
	paused: boolean = false;
	stopped: boolean = true;
	soundStart: number = 0;
	pauseOffset: number = 0;
	resumeTime: number = 0;
	
	player: MusicPlayer;
	public path: string;
	onended: () => void;
	onloaded: () => void;

	/// @ts-ignore
	buffer: AudioBuffer;
	
	/// @ts-ignore
	source: AudioBufferSourceNode;

	constructor(player: MusicPlayer, path: string, onended: () => void, onloaded: () => void) {
		this.player = player;
		this.path = path;
		this.onended = onended;
		this.onloaded = onloaded;
		this.initializeSource();
		fetchAudio(this.path, (audioData) => {
			return this.player.ctx.decodeAudioData(audioData, (decodedData) => {
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
		// this.resumeTime = Date.now();
		if (!this.paused && this.stopped) {
			this.soundStart = Date.now();
			this.source.onended = this.onended;
			this.source.start();
			return this.stopped = false;
		} else if (this.paused) {
			this.soundStart = Date.now() - this.pauseOffset;
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
			// milliseconds
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
			return (Date.now() - (this.soundStart + 0)) / 1000;
		}
	}

	/** Manually set the position of playback in the song */
	setPosition(position: number) {
		if (position < this.buffer.duration) {
			if (this.paused) {
				return this.pauseOffset = position * 1000;
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

class MusicPlayer extends EventEmitter {
	playlist: MusicTrack[];
	muted: boolean;
	track: number;

	ctx: AudioContext;
	gainNode: GainNode;
	previousGain: number;

	////////////
	// Events //
	////////////

	onSongFinished(path: string) {
		if (!(this.playlist.length - 1 > this.track)) this.onPlaylistEnded();
		this.emit("trackfinished", path);
		return;
	}

	onPlaylistEnded() {
		this.emit("playlistended");
		return;
	}

	onPlayerStopped() {
		this.emit("stopped");
		return;
	}

	onPlayerPaused() {
		this.emit("paused");
		return;
	}

	onPlayerResumed() {
		this.emit("play");
		return;
	}

	onTrackLoaded(path: string) {
		this.emit("trackloaded", path);
		// dispatchEvent(new CustomEvent<{ path: string }>("trackloaded", { detail: { path: path } }));
		// return;
		// this._trackLoaded.dispatch(path);
		// return this._trackLoaded.asEvent();
	}

	// onTrackLoaded = new CustomEvent("trackloaded");

	onTrackAdded(path: string) {
		this.emit("trackadded", path);
		return;
	}
	
	onTrackRemoved(path: string) {
		this.emit("trackremoved", path);
		return;
	}
	
	onVolumeChanged(newValue: number) {
		this.emit("volumechanged", { from: this.previousGain, to: newValue });
		return;
	}

	onMuted() {
		this.emit("muted");
		return;
	}
	
	onUnmuted() {
		this.emit("unmuted");
		return;
	}

	constructor() {
		super();
		this.ctx = new (window.AudioContext);
		this.gainNode = this.ctx.createGain();
		this.gainNode.connect(this.ctx.destination);
		this.previousGain = this.gainNode.gain.value;
		this.playlist = [];
		this.muted = false;
		this.track = 0;
	}
	
	getCurrentTrack() {
		return this.track;
	}

	setCurrentTrack = (track: number) => {
		this.playlist[this.track].stop();
		this.track = track;
	}

	setVolume(value: number) {
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
			this.playlist[this.track].pause();
			return this.onPlayerPaused();
		}
	}

	stop() {
		if (this.playlist.length !== 0) {
			this.playlist[this.track].stop();
			return this.onPlayerStopped();
		}
	}

	play() {
		if (this.playlist.length !== 0) {
			this.playlist[this.track].play();
			return this.onPlayerResumed();
		}
	}

	playNext() {
		const isPaused = this.playlist[this.track].paused;
		const isStopped = this.playlist[this.track].stopped;
		if (this.playlist.length !== 0) {
			if (!isPaused && !isStopped) this.playlist[this.track].stop();
			// this.playlist.shift();
			this.track++;
			if (this.playlist.length === this.track) {
				this.track--;
				return;
			};
			this.emit("skipnext", this.track - 1, this.track);
			if (isPaused || isStopped) {
				// return this.playlist[this.track].pause();
			} else {
				return this.playlist[this.track].play();
			}
			// if (this.playlist.length === 0) {
			// 	return this.onPlaylistEnded();
			// } else {
			// 	// return this.playlist[0].play();
			// }
		}
	}
	
	playPrev() {
		const isPaused = this.playlist[this.track].paused;
		const isStopped = this.playlist[this.track].stopped;
		if (this.track > 0 && this.playlist.length !== 0) {
			if (!isPaused && !isStopped) this.playlist[this.track].stop();
			this.track--;
			this.emit("skipback", this.track + 1, this.track);
			if (isPaused || isStopped) {
				// return this.playlist[this.track].pause();
			} else {
				return this.playlist[this.track].play();
			}
		}
	}

	addTrack(paths: string | string[]) {
		if (paths instanceof Array) {
			for (const path of paths) {
				const finishedCallback = () => {
					this.onSongFinished(path);
					// this.track = this.track + 1;
					return this.playNext();
				};
		
				const loadedCallback = () => {
					return this.onTrackLoaded(path);
				};
		
				this.playlist.push(new MusicTrack(this, path, finishedCallback, loadedCallback));
			}
			return;
		} else {
			const finishedCallback = () => {
				this.onSongFinished(paths);
				// this.track = this.track + 1;
				return this.playNext();
			};
	
			const loadedCallback = () => {
				return this.onTrackLoaded(paths);
			};
	
			return this.playlist.push(new MusicTrack(this, paths, finishedCallback, loadedCallback));
		}
	}

	insertTrack(index: number, path: string) {
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

	removeTrack(index: number) {
		const song = this.playlist.splice(index, 1)[0];
		return this.onTrackRemoved(song.path);
	}

	replaceTrack(index: number, path: string) {
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

	getSongDuration(index: number) {
		if (this.playlist.length === this.track) {
			return 0;
		} else {
			if (index != null) {
				return (this.playlist[index] != null ? this.playlist[index].getDuration() : undefined);
			} else {
				return this.playlist[this.track].getDuration();
			}
		}
	}

	getSongPosition() {
		if (this.playlist.length === this.track) {
			return 0;
		} else {
			return this.playlist[this.track].getPosition();
		}
	}

	setSongPosition(value: number) {
		if (this.playlist.length !== 0) {
			return this.playlist[this.track].setPosition(value);
		}
	}

	removeAllTracks() {
		this.stop();
		this.playlist = [];
		return [];
	}
}

// exports.MusicPlayer = MusicPlayer;

export {
	MusicPlayer
};