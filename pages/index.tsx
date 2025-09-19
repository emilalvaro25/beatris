import dynamic from 'next/dynamic';
import Head from 'next/head';

const LiveAudio = dynamic(() => import('../components/LiveAudio'), {
  ssr: false,
  loading: () => <div style={{ textAlign: 'center', paddingTop: '45vh' }}>Loading Beatrice...</div>,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Beatrice</title>
        <meta name="description" content="Experience real-time voice chat with 3D visuals react to your conversation, bringing AI interaction to life." />
      </Head>
      <LiveAudio />
    </>
  );
}
