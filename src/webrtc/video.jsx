import React, { useEffect, useRef } from 'react';

const Video = ({ item }) => {
  const { username, stream, id } = item;
  const videoRef = useRef(null);

  useEffect(() => {
    if (stream && stream.id && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream.mediaStream;
    }

    return () => {
      console.log('video destroy: ', username);
    };
  }, [id, stream, username]);

  return (
    <div className="wrap-video">
      <span>{username}</span>

      <video ref={videoRef} autoPlay playsInline controls={false}></video>
    </div>
  );
};

export default Video;
