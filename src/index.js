import { Events, Playback, Mediator, Styler, template } from 'Clappr'

import playbackStyle from './public/style.css'
import playbackHtml from './public/youtube.html'

// NOTE: this will match ^.*v/([^#\&\?]*).* which is too wide open...
//const YT_URL_PARSER = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?)|(feature\=player_embedded&))\??v?=?([^#\&\?]*).*/
const YT_URL_PARSER = /^.*((youtu.be\/)|(youtube.com\/v\/)|(youtube.com\/u\/\w\/)|(youtube.com\/embed\/)|(youtube.com\/watch\?)|(feature\=player_embedded&))\??v?=?([^#\&\?]*).*/

// Flag to track if youtube api got loaded on to the DOM
let apiLoaded = false

export default class YoutubePlayback extends Playback {
  get name () { return 'youtube_playback' }

  get template () { return template(playbackHtml) }

  get attributes () {
    return {
      'data-youtube-playback': '',
      class: 'clappr-youtube-playback',
      id: this.cid
    }
  }

  get ended () { return false }
  get buffering () { return this.player && this.player.getPlayerState() === YT.PlayerState.BUFFERING }
  get isReady () { return this._ready }

  constructor (options) {
    super(options)
    this.settings = {
      changeCount: 0,
      seekEnabled: true,
      left: ['playpause', 'position', 'duration'],
      default: ['seekbar'],
      right: ['fullscreen', 'volume', 'hd-indicator']
    }
    Mediator.on(Events.PLAYER_RESIZE, this.updateSize, this)
    // If the script tag is already loaded simply call ready
    if (!apiLoaded) {
      this.embedYoutubeApiScript()
      apiLoaded = true
    } else {
// try stalling to see if that helps
// yes it helps - 100ms too low, 500ms works almost always
var _this = this;
setTimeout(function(){
      _this.ready()
},500);
    }
  }

  setupYoutubePlayer () {
    if (window.YT && window.YT.Player) {
      this.embedYoutubePlayer()
    } else {
// NO - this only fires for one instance of YT player
// ... because PLAYBACK_READY is firing before this gets installed ...
//      this.once(Events.PLAYBACK_READY, () => this.embedYoutubePlayer())
      console.log("awaiting PLAYBACK_READY")
      this.once(Events.PLAYBACK_READY, () => this.embedYoutubePlayer())
    }
  }

  embedYoutubeApiScript () {
    let script = document.createElement('script')
    script.setAttribute('type', 'text/javascript')
    script.setAttribute('async', 'async')
    script.setAttribute('src', 'https://www.youtube.com/iframe_api')
    document.body.appendChild(script)
    window.onYouTubeIframeAPIReady = () => this.ready()
  }

  findVideoId (url) {
    let match_content = url.match(YT_URL_PARSER)
    if (match_content && match_content[match_content.length - 1].length === 11) {
      return match_content[match_content.length - 1]
    } else {
      return url
    }
  }

  findVideoQuality (url) {
    let regVideoQuality = /[?&]vq=([^#\&\?]+)/
    let match = url.match(regVideoQuality)
    if(match !== null && match.length > 1) {
      return match[1]
    }
    return 'auto'
  }

  embedYoutubePlayer () {
    let playerVars = {
      controls: 0,
      autoplay: 1,
      disablekb: 1,
      enablejsapi: 1,
      iv_load_policy: 3,
      modestbranding: 1,
      showinfo: 0,
      html5: 1,
      playsinline: 1,
      vq: this.options.videoQuality || this.findVideoQuality(this.options.src),
      rel: this.options.youtubeShowRelated || 0,
      loop: this.options.loop ? 1 : 0
    }
    var isLocalProtocol = window.location.protocol === 'file:' || window.location.protocol === 'app:'
    if (!isLocalProtocol) {
      playerVars.origin = window.location.protocol + '//' + window.location.host
    }
    if (this.options.youtubePlaylist) {
      playerVars.listType = 'playlist'
      playerVars.list = this.options.youtubePlaylist
    }
    this.player = new YT.Player(`yt${this.cid}`, {
      width: this.options.width || '100%',
      height: this.options.height || '100%',
      videoId: this.findVideoId(this.options.src),
      playerVars: playerVars,
      events: {
        onReady: () => this.ready(),
        onStateChange: (event) => this.stateChange(event),
        onPlaybackQualityChange: (event) => this.qualityChange(event)
      }
    })
  }

  updateSize () {
    this.player && this.player.setSize(this.$el.width(), this.$el.height())
  }

  ready () {
    this._ready = true
    if (this.options.mute) {
      this.volume(0)
    }
    console.log("trigger PLAYBACK_READY")
    this.trigger(Events.PLAYBACK_READY)
  }

  qualityChange (event) { // eslint-disable-line no-unused-vars
    this.trigger(Events.PLAYBACK_HIGHDEFINITIONUPDATE, this.isHighDefinitionInUse())
  }

  stateChange (event) {
    switch (event.data) {
      case YT.PlayerState.PLAYING: {
        this.enableMediaControl()
        let playbackType = this.getPlaybackType()
        if (this._playbackType !== playbackType) {
          this.settings.changeCount++
          this._playbackType = playbackType
          this.trigger(Events.PLAYBACK_SETTINGSUPDATE)
        }
        this.trigger(Events.PLAYBACK_BUFFERFULL)
        this.trigger(Events.PLAYBACK_PLAY)
        break
      }
      case YT.PlayerState.PAUSED:
        this.trigger(Events.PLAYBACK_PAUSE)
        break
      case YT.PlayerState.BUFFERING:
        this.trigger(Events.PLAYBACK_BUFFERING)
        break
      case YT.PlayerState.ENDED:
        if (this.options.youtubeShowRelated) {
          this.disableMediaControl()
        } else {
          this.trigger(Events.PLAYBACK_ENDED)
        }
        break
      default:
        break
    }
  }

  play () {
    if (this.player) {
      this._progressTimer = this._progressTimer || setInterval(() => this.progress(), 100)
      this._timeupdateTimer = this._timeupdateTimer || setInterval(() => this.timeupdate(), 100)
      this.player.playVideo()
    } else if (this._ready) {
      this.trigger(Events.PLAYBACK_BUFFERING)
      this._progressTimer = this._progressTimer || setInterval(() => this.progress(), 100)
      this._timeupdateTimer = this._timeupdateTimer || setInterval(() => this.timeupdate(), 100)
      this.setupYoutubePlayer()
    } else {
      this.trigger(Events.PLAYBACK_BUFFERING)
      this.listenToOnce(this, Events.PLAYBACK_READY, this.play)
    }
  }

  pause () {
    clearInterval(this._timeupdateTimer)
    this._timeupdateTimer = null
    this.player && this.player.pauseVideo()
  }

  seek (time) {
    if (!this.player) return
    this.player.seekTo(time)
  }

  seekPercentage (percentage) {
    if (!this.player) return
    let duration = this.player.getDuration()
    let time = percentage * duration / 100
    this.seekTo(time)
  }

  volume (value) {
    this.player && this.player.setVolume && this.player.setVolume(value)
  }

  progress () {
    if (!this.player || !this.player.getDuration) return
    let buffered = this.player.getDuration() * this.player.getVideoLoadedFraction()
    this.trigger(Events.PLAYBACK_PROGRESS, {start: 0, current: buffered, total: this.player.getDuration()})
  }

  timeupdate () {
    if (!this.player || !this.player.getDuration) return
    this.trigger(Events.PLAYBACK_TIMEUPDATE, {current: this.player.getCurrentTime(), total: this.player.getDuration()})
  }

  isPlaying () {
    return this.player && this.player.getPlayerState() == YT.PlayerState.PLAYING
  }

  isHighDefinitionInUse () {
    return this.player && !!this.player.getPlaybackQuality().match(/^hd\d+/)
  }

  getDuration () {
    let duration = 0
    if (this.player) {
      duration = this.player.getDuration()
    }
    return duration
  }

  getPlaybackType () {
    return Playback.VOD
  }

  disableMediaControl () {
    this.$el.css({'pointer-events': 'auto'})
    this.trigger(Events.PLAYBACK_MEDIACONTROL_DISABLE)
  }

  enableMediaControl () {
    this.$el.css({'pointer-events': 'none'})
    this.trigger(Events.PLAYBACK_MEDIACONTROL_ENABLE)
  }

  render () {
    this.$el.html(this.template({id: `yt${this.cid}`}))
    let style = Styler.getStyleFor(playbackStyle, {baseUrl: this.options.baseUrl})
    this.$el.append(style)
    if (this.options.autoPlay) {
        this.play()
    }
    return this
  }
}

YoutubePlayback.canPlay = function (source) { // eslint-disable-line no-unused-vars
  return YT_URL_PARSER.test(source)
}
