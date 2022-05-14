import React, { useEffect, useRef } from 'react';

const Video = ({ item }) => {
  const { displayName, video, audio, stream } = item;
  const videoRef = useRef(null);

  console.log('video item: ', item);

  useEffect(() => {
    if (stream && stream.id) {
      videoRef.current.srcObject = stream.mediaStream;
    }
  }, [stream.id]);

  return (
    <div className="wrap-video">
      <span>{displayName}</span>

      <video ref={videoRef} autoPlay playsInline controls={false}></video>
    </div>
  );
};

export default Video;
