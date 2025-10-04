import React, { useRef, useEffect } from 'react';
import './BackgroundVideo.css';

interface BackgroundVideoProps {
  src: string;
  type?: string;
}

const BackgroundVideo: React.FC<BackgroundVideoProps> = ({ src, type = 'video/mp4' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Ensure the video plays on mount
    if (videoRef.current) {
      videoRef.current.play().catch(error => {
        // Autoplay was prevented.
        console.error("Video autoplay was prevented:", error);
      });
    }
  }, []);

  return (
    <video ref={videoRef} playsInline autoPlay muted loop className="background-video">
      <source src={src} type={type} />
      Your browser does not support the video tag.
    </video>
  );
};

export default BackgroundVideo;