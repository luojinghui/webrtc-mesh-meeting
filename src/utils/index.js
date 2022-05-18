export const MS = {
  login: 'LOGIN',
  meeting: 'MEETING',
};

export const DEFAULT_ICE_SERVER = {
  url: 'turn:47.52.156.68:3478',
  credential: 'zmecust',
  username: 'zmecust',
};

export const CONFIGURATION = {
  iceServers: [DEFAULT_ICE_SERVER],
  sdpSemantics: 'unified-plan',
};
