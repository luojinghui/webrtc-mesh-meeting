import React, { useEffect, useRef } from 'react';

const Video = ({ item }) => {
  const { username, stream, id, isLocal } = item;
  console.log('item========: ', item);
  const videoRef = useRef(null);

  useEffect(() => {
    if (stream && stream.id && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream.mediaStream;
    }

    return () => {
      console.log('video destroy: ', username);
    };
  }, [id, stream, username]);

  const localStyle = React.useMemo(() => {
    return isLocal ? { transform: 'rotateY(180deg)' } : {};
  }, [isLocal]);

  return (
    <div className="wrap-video">
      <span>{username}</span>
      {!item.video && <div className="video video-status">视频暂停中</div>}
      <video
        style={localStyle}
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        className="video"
      ></video>
    </div>
  );
};

export default Video;
