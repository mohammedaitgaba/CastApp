import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Animated,
  Easing,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
import {
  CastButton,
  useRemoteMediaClient,
  useCastState,
  useCastDevice,
  useMediaStatus,
  useStreamPosition,
  useDevices,
  CastState,
  MediaPlayerState,
} from 'react-native-google-cast';
import Paho from 'paho-mqtt';

// TODO: Replace with your hosted receiver URL after publishing to GitHub Pages/Netlify
const RECEIVER_BASE_URL = 'https://mohammedaitgaba.github.io/CastApp/receiver.html';


// ── Sample Videos ──
const SAMPLE_VIDEOS = [
  {
    id: '1',
    title: 'Big Buck Bunny',
    subtitle: 'Animation • 10 min',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    image: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    duration: 596,
  },
  {
    id: '2',
    title: 'Sintel',
    subtitle: 'Fantasy • 15 min',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    image: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
    duration: 888,
  },
  {
    id: '3',
    title: 'Tears of Steel',
    subtitle: 'Sci-Fi • 12 min',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    image: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
    duration: 734,
  },
  {
    id: '4',
    title: 'Elephants Dream',
    subtitle: 'Sci-Fi • 11 min',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    image: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    duration: 653,
  },
];

// ── Helpers ──
function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getStateColor(state: CastState | null | undefined) {
  switch (state) {
    case CastState.CONNECTED:
      return '#22c55e';
    case CastState.CONNECTING:
      return '#f59e0b';
    case CastState.NOT_CONNECTED:
      return '#64748b';
    default:
      return '#94a3b8';
  }
}

function getStateLabel(state: CastState | null | undefined) {
  switch (state) {
    case CastState.CONNECTED:
      return 'Connected';
    case CastState.CONNECTING:
      return 'Connecting…';
    case CastState.NOT_CONNECTED:
      return 'Not Connected';
    case CastState.NO_DEVICES_AVAILABLE:
      return 'No Devices';
    default:
      return 'Unknown';
  }
}

// ── Components ──

/** Animated pulsing dot for connection status */
function PulsingDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.2, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[
          styles.pulseRing,
          { backgroundColor: color, opacity, transform: [{ scale }] },
        ]}
      />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

/** Background animated blobs */
function AnimatedBackground() {
  const rotate1 = useRef(new Animated.Value(0)).current;
  const rotate2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate1, { toValue: 1, duration: 25000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(rotate2, { toValue: 1, duration: 35000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [rotate1, rotate2]);

  const spin1 = rotate1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2 = rotate2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.blob, styles.blob1, { transform: [{ rotate: spin1 }] }]} />
      <Animated.View style={[styles.blob, styles.blob2, { transform: [{ rotate: spin2 }] }]} />
      <View style={styles.overlay} />
    </View>
  );
}

/** Small video card in the library */
function VideoCard({
  item,
  onPress,
}: {
  item: typeof SAMPLE_VIDEOS[0];
  onPress: (v: typeof SAMPLE_VIDEOS[0]) => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.videoCard} onPress={() => onPress(item)}>
      <View style={styles.thumbPlaceholder}>
        <Text style={styles.thumbEmoji}>🎬</Text>
      </View>
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.videoSubtitle}>{item.subtitle}</Text>
      </View>
      <View style={styles.playIconCircle}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </TouchableOpacity>
  );
}

/** Icon button for controls */
function IconButton({
  emoji,
  onPress,
  disabled,
  size = 48,
}: {
  emoji: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Text style={[styles.iconBtnText, { fontSize: size * 0.45 }]}>{emoji}</Text>
    </TouchableOpacity>
  );
}

/** Custom progress bar */
function ProgressBar({
  progress,
  duration,
}: {
  progress: number;
  duration: number;
}) {
  const pct = duration > 0 ? Math.min(Math.max(progress / duration, 0), 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

// ── Main App ──
export default function App() {
  const client = useRemoteMediaClient();
  const castState = useCastState();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const streamPosition = useStreamPosition(1);
  const devices = useDevices();

  const [customUrl, setCustomUrl] = useState('');
  const [isCastingLoading, setIsCastingLoading] = useState(false);

  // Web Cast state
  const [webRoom] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [webConnected, setWebConnected] = useState(false);
  const [webIsPlaying, setWebIsPlaying] = useState(false);
  const [webPosition, setWebPosition] = useState(0);
  const [webDuration, setWebDuration] = useState(0);
  const [webCustomUrl, setWebCustomUrl] = useState('');
  const webClientRef = useRef<Paho.Client | null>(null);
  const receiverUrl = `${RECEIVER_BASE_URL}?room=${webRoom}`;

  const connected = castState === CastState.CONNECTED;
  const stateColor = getStateColor(castState);

  // Web Cast MQTT connection
  useEffect(() => {
    const clientId = 'auracast_phone_' + Math.random().toString(36).substr(2, 9);
    const client = new Paho.Client('broker.hivemq.com', 8000, clientId);
    client.onConnectionLost = () => setWebConnected(false);
    client.onMessageArrived = (msg: Paho.Message) => {
      try {
        const data = JSON.parse(msg.payloadString);
        if (data.action === 'status') {
          setWebIsPlaying(!!data.isPlaying);
          setWebPosition(typeof data.currentTime === 'number' ? data.currentTime : 0);
          setWebDuration(typeof data.duration === 'number' ? data.duration : 0);
        }
      } catch {}
    };
    client.connect({
      onSuccess: () => {
        setWebConnected(true);
        client.subscribe('auracast/' + webRoom + '/status');
      },
      onFailure: () => setWebConnected(false),
      useSSL: false,
    });
    webClientRef.current = client;
    return () => {
      try { client.disconnect(); } catch {}
    };
  }, [webRoom]);

  // Entrance animations
  const headerY = useRef(new Animated.Value(-30)).current;
  const headerOp = useRef(new Animated.Value(0)).current;
  const bodyY = useRef(new Animated.Value(40)).current;
  const bodyOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerY, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(headerOp, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(bodyY, { toValue: 0, duration: 900, delay: 200, useNativeDriver: true }),
      Animated.timing(bodyOp, { toValue: 1, duration: 900, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [bodyOp, bodyY, headerOp, headerY]);

  async function loadVideo(url: string, title?: string, duration?: number) {
    if (!client) {
      Alert.alert('Not Connected', 'Tap the Cast button to connect to a device first.');
      return;
    }
    setIsCastingLoading(true);
    try {
      await client.loadMedia({
        autoplay: true,
        mediaInfo: {
          contentUrl: url,
          contentType: 'video/mp4',
          streamDuration: duration,
          metadata: {
            type: 'movie',
            title: title || 'Custom Video',
            subtitle: 'CastApp',
            images: [
              { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg' },
            ],
          },
        },
      });
    } catch (e: any) {
      Alert.alert('Cast Error', e?.message || 'Failed to load media');
    } finally {
      setIsCastingLoading(false);
    }
  }

  async function handlePlayPause() {
    if (!client || !mediaStatus) return;
    if (mediaStatus.playerState === MediaPlayerState.PLAYING) {
      await client.pause();
    } else {
      await client.play();
    }
  }

  async function handleStop() {
    if (!client) return;
    await client.stop();
  }

  async function handleSeek(delta: number) {
    if (!client || !streamPosition) return;
    const newPos = Math.max(0, streamPosition + delta);
    await client.seek({ position: newPos });
  }

  async function handleVolume(delta: number) {
    if (!client || !mediaStatus) return;
    const newVol = Math.min(1, Math.max(0, mediaStatus.volume + delta));
    await client.setStreamVolume(newVol);
  }

  async function handleMuteToggle() {
    if (!client || !mediaStatus) return;
    await client.setStreamMuted(!mediaStatus.isMuted);
  }

  // Web Cast helpers
  function sendWebCommand(action: string, extra?: object) {
    const c = webClientRef.current;
    if (!c || !c.isConnected()) {
      Alert.alert('Web Cast Not Ready', 'Check your internet connection and try again.');
      return false;
    }
    const payload = JSON.stringify({ action, ...extra });
    const msg = new Paho.Message(payload);
    msg.destinationName = 'auracast/' + webRoom + '/cmd';
    c.send(msg);
    return true;
  }

  function handleWebLoad(url: string, title?: string) {
    if (sendWebCommand('load', { url, title })) {
      setWebIsPlaying(true);
    }
  }

  function handleWebPlay() {
    sendWebCommand('play');
    setWebIsPlaying(true);
  }

  function handleWebPause() {
    sendWebCommand('pause');
    setWebIsPlaying(false);
  }

  function handleWebStop() {
    sendWebCommand('stop');
    setWebIsPlaying(false);
    setWebPosition(0);
    setWebDuration(0);
  }

  function handleWebSeek(delta: number) {
    const newPos = Math.max(0, (webPosition || 0) + delta);
    sendWebCommand('seek', { time: newPos });
    setWebPosition(newPos);
  }

  const currentTitle = mediaStatus?.mediaInfo?.metadata?.title || 'Nothing Playing';
  const currentSubtitle = (mediaStatus?.mediaInfo?.metadata as any)?.subtitle || 'Select a video to cast';
  const duration = mediaStatus?.mediaInfo?.streamDuration || 0;
  const position = streamPosition || 0;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;
  const isBuffering = mediaStatus?.playerState === MediaPlayerState.BUFFERING || mediaStatus?.playerState === MediaPlayerState.LOADING;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <AnimatedBackground />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <Animated.View style={[styles.header, { transform: [{ translateY: headerY }], opacity: headerOp }]}>
          <View>
            <Text style={styles.brand}>AuraCast</Text>
            <Text style={styles.tagline}>Stream to your world</Text>
          </View>
          <CastButton style={styles.castButton} />
        </Animated.View>

        {/* Connection Pill */}
        <Animated.View style={[styles.pillRow, { transform: [{ translateY: bodyY }], opacity: bodyOp }]}>
          <View style={styles.pill}>
            <PulsingDot color={stateColor} />
            <Text style={[styles.pillText, { color: stateColor }]}>
              {getStateLabel(castState)}
            </Text>
          </View>
          {connected && castDevice && (
            <View style={[styles.pill, { marginLeft: 8, backgroundColor: 'rgba(30,41,59,0.8)' }]}>
              <Text style={[styles.pillText, { color: '#e2e8f0' }]}>📡 {castDevice.friendlyName}</Text>
            </View>
          )}
        </Animated.View>

        {/* Discovered Devices Debug */}
        <Animated.View style={[styles.section, { transform: [{ translateY: bodyY }], opacity: bodyOp }]}>
          <Text style={styles.sectionTitle}>📡 Nearby Devices ({devices.length})</Text>
          {devices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No Google Cast devices found yet.</Text>
              <Text style={styles.emptySub}>Make sure your TV supports Chromecast and is on the same Wi-Fi.</Text>
            </View>
          ) : (
            devices.map((d) => (
              <View key={d.deviceId} style={styles.deviceRow}>
                <Text style={styles.deviceName}>📺 {d.friendlyName}</Text>
                <Text style={styles.deviceModel}>{d.modelName}</Text>
              </View>
            ))
          )}
        </Animated.View>

        {/* Now Playing Card */}
        <Animated.View style={[styles.glassCard, { transform: [{ translateY: bodyY }], opacity: bodyOp }]}>
          <View style={styles.nowPlayingHeader}>
            <View style={styles.artwork}>
              <Text style={styles.artworkEmoji}>🎥</Text>
            </View>
            <View style={styles.nowPlayingText}>
              <Text style={styles.nowPlayingTitle} numberOfLines={1}>{currentTitle}</Text>
              <Text style={styles.nowPlayingSubtitle} numberOfLines={1}>{currentSubtitle}</Text>
              {isBuffering && <Text style={styles.bufferingText}>Buffering…</Text>}
            </View>
          </View>

          <ProgressBar progress={position} duration={duration} />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.controlsRow}>
            <IconButton emoji="⏹️" onPress={handleStop} disabled={!connected || !mediaStatus} size={44} />
            <IconButton emoji="⏪" onPress={() => handleSeek(-10)} disabled={!connected || !mediaStatus} size={44} />
            <IconButton emoji={isPlaying ? '⏸️' : '▶️'} onPress={handlePlayPause} disabled={!connected || !mediaStatus} size={60} />
            <IconButton emoji="⏩" onPress={() => handleSeek(10)} disabled={!connected || !mediaStatus} size={44} />
            <IconButton emoji={mediaStatus?.isMuted ? '🔇' : '🔊'} onPress={handleMuteToggle} disabled={!connected || !mediaStatus} size={44} />
          </View>

          <View style={styles.volumeRow}>
            <TouchableOpacity
              style={[styles.smallBtn, (!connected || !mediaStatus) && { opacity: 0.35 }]}
              onPress={() => handleVolume(-0.1)}
              disabled={!connected || !mediaStatus}
            >
              <Text style={styles.smallBtnText}>Vol -</Text>
            </TouchableOpacity>
            <View style={styles.volTrack}>
              <View
                style={[
                  styles.volFill,
                  { width: `${Math.round((mediaStatus?.volume || 0) * 100)}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              style={[styles.smallBtn, (!connected || !mediaStatus) && { opacity: 0.35 }]}
              onPress={() => handleVolume(0.1)}
              disabled={!connected || !mediaStatus}
            >
              <Text style={styles.smallBtnText}>Vol +</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Video Library */}
        <Animated.View style={[styles.section, { transform: [{ translateY: bodyY }], opacity: bodyOp }]}>
          <Text style={styles.sectionTitle}>🎬 Video Library</Text>
          {SAMPLE_VIDEOS.map((video) => (
            <VideoCard
              key={video.id}
              item={video}
              onPress={(v) => loadVideo(v.url, v.title, v.duration)}
            />
          ))}
        </Animated.View>

        {/* Custom URL */}
        <Animated.View style={[styles.section, { transform: [{ translateY: bodyY }], opacity: bodyOp }]}>
          <Text style={styles.sectionTitle}>🔗 Custom URL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Paste a video URL…"
              placeholderTextColor="#64748b"
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.castUrlBtn, (!customUrl || !connected) && { opacity: 0.45 }]}
              onPress={() => loadVideo(customUrl, 'Custom Video')}
              disabled={!customUrl || !connected || isCastingLoading}
            >
              <Text style={styles.castUrlBtnText}>Cast</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Universal Web Cast */}
        <Animated.View style={[styles.glassCard, { transform: [{ translateY: bodyY }], opacity: bodyOp }, { borderColor: 'rgba(34,197,94,0.25)' }]}>
          <View style={styles.webHeader}>
            <Text style={styles.webTitle}>🌐 Universal Web Cast</Text>
            <View style={[styles.webPill, webConnected && styles.webPillConnected]}>
              <Text style={[styles.webPillText, webConnected && styles.webPillTextConnected]}>
                {webConnected ? 'Online' : 'Connecting…'}
              </Text>
            </View>
          </View>
          <Text style={styles.webSub}>
            Works on ANY smart TV with a browser — LG, Samsung, Sony, Roku, Xbox, PlayStation
          </Text>

          <View style={styles.roomBox}>
            <Text style={styles.roomLabel}>ROOM CODE</Text>
            <Text style={styles.roomCode}>{webRoom}</Text>
          </View>

          <View style={styles.qrWrap}>
            <Image
              style={styles.qrImage}
              source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(receiverUrl)}` }}
            />
            <Text style={styles.qrCaption}>Scan with your phone to open the TV link</Text>
          </View>

          <View style={styles.stepsBox}>
            <Text style={styles.step}><Text style={styles.stepNum}>1.</Text> Open your TV’s web browser</Text>
            <Text style={styles.step}><Text style={styles.stepNum}>2.</Text> Go to: <Text style={styles.stepUrl} selectable>{RECEIVER_BASE_URL}</Text></Text>
            <Text style={styles.step}><Text style={styles.stepNum}>3.</Text> Enter room code: <Text style={styles.roomCodeInline}>{webRoom}</Text> (auto-filled if you scan the QR code)</Text>
          </View>

          {webConnected && (
            <>
              <ProgressBar progress={webPosition} duration={webDuration} />
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(webPosition)}</Text>
                <Text style={styles.timeText}>{formatTime(webDuration)}</Text>
              </View>

              <View style={styles.controlsRow}>
                <IconButton emoji="⏹️" onPress={handleWebStop} disabled={!webConnected} size={44} />
                <IconButton emoji="⏪" onPress={() => handleWebSeek(-10)} disabled={!webConnected} size={44} />
                <IconButton emoji={webIsPlaying ? '⏸️' : '▶️'} onPress={webIsPlaying ? handleWebPause : handleWebPlay} disabled={!webConnected} size={60} />
                <IconButton emoji="⏩" onPress={() => handleWebSeek(10)} disabled={!webConnected} size={44} />
                <IconButton emoji="🔄" onPress={() => { setWebPosition(0); setWebDuration(0); setWebIsPlaying(false); }} disabled={false} size={44} />
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 14, marginBottom: 8 }]}>Cast URL to Web TV</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Paste a video URL for Web Cast…"
              placeholderTextColor="#64748b"
              value={webCustomUrl}
              onChangeText={setWebCustomUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.castUrlBtn, (!webCustomUrl || !webConnected) && { opacity: 0.45 }]}
              onPress={() => handleWebLoad(webCustomUrl, 'Custom Web Video')}
              disabled={!webCustomUrl || !webConnected}
            >
              <Text style={styles.castUrlBtnText}>Cast</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 14, marginBottom: 8 }]}>Quick Cast to Web TV</Text>
          {SAMPLE_VIDEOS.map((video) => (
            <VideoCard
              key={'web-' + video.id}
              item={video}
              onPress={(v) => handleWebLoad(v.url, v.title)}
            />
          ))}
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Background
  blob: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    opacity: 0.35,
  },
  blob1: {
    top: -120,
    left: -120,
    backgroundColor: '#6366f1', // indigo
  },
  blob2: {
    bottom: -140,
    right: -140,
    backgroundColor: '#8b5cf6', // violet
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,25,0.55)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  castButton: {
    width: 32,
    height: 32,
    tintColor: '#f8fafc',
  },

  // Connection Pill
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  pulseContainer: {
    width: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Glass Card
  glassCard: {
    backgroundColor: 'rgba(30,41,59,0.55)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },

  // Now Playing
  nowPlayingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  artwork: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(99,102,241,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  artworkEmoji: {
    fontSize: 28,
  },
  nowPlayingText: {
    flex: 1,
    marginLeft: 14,
  },
  nowPlayingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  nowPlayingSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  bufferingText: {
    fontSize: 11,
    color: '#f59e0b',
    marginTop: 4,
    fontWeight: '600',
  },

  // Progress
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8b5cf6',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },

  // Controls
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconBtnText: {
    color: '#f8fafc',
  },

  // Volume
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  smallBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  smallBtnText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  volTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginHorizontal: 12,
  },
  volFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },

  // Section
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
  },

  // Video Card
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.45)',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(99,102,241,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbEmoji: {
    fontSize: 22,
  },
  videoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  videoSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  playIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
  },
  playIcon: {
    fontSize: 14,
    color: '#f8fafc',
    marginLeft: 2,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(30,41,59,0.55)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  castUrlBtn: {
    marginLeft: 10,
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  castUrlBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Device debug
  emptyBox: {
    backgroundColor: 'rgba(30,41,59,0.45)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deviceName: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceModel: {
    color: '#94a3b8',
    fontSize: 12,
  },

  // Web Cast
  webHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  webTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  webSub: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 14,
  },
  webPill: {
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  webPillConnected: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  webPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  webPillTextConnected: {
    color: '#22c55e',
  },
  roomBox: {
    backgroundColor: 'rgba(11,15,25,0.6)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  roomLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  roomCode: {
    fontSize: 36,
    fontWeight: '800',
    color: '#22c55e',
    letterSpacing: 4,
  },
  webHint: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 14,
  },
  roomCodeInline: {
    color: '#22c55e',
    fontWeight: '700',
  },
  qrWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  qrImage: {
    width: 160,
    height: 160,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 8,
  },
  qrCaption: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  stepsBox: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  step: {
    fontSize: 13,
    color: '#e2e8f0',
    lineHeight: 20,
    marginBottom: 6,
  },
  stepNum: {
    color: '#8b5cf6',
    fontWeight: '700',
  },
  stepUrl: {
    color: '#22c55e',
    fontWeight: '600',
  },
});
