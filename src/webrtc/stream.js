/**
 * Stream lib
 */

const VIDEO_CONSTRAINTS = {
  aspectRatio: 1.7778,
  resizeMode: 'crop-and-scale',
  width: 640,
  height: 360,
};

class Stream {
  constructor() {
    this.mediaStream = null;
    this.constraints = null;
    this.streamId = null;
  }

  /**
   * 获取本地Mediastream
   *
   * @returns MediaStream
   */
  getStream() {
    return {
      mediaStream: this.mediaStream,
      id: this.mediaStream?.id,
    };
  }

  async initStream(config) {
    const { video = true, audio = true } = config || {};
    const constraints = {};
    constraints.audio = audio;

    const videoCons = video ? VIDEO_CONSTRAINTS : false;
    constraints.video = videoCons;

    try {
      this.mediaStream = await this.getUserMedia(constraints);
      this.streamId = this.mediaStream.id;
    } catch (err) {
      console.log('getUserMedia error: ', err);
    }
  }

  async getUserMedia(constraints) {
    return await navigator.mediaDevices.getUserMedia(constraints);
  }
}

export default Stream;
