/**
 * YouTube Data API v3 Service
 *
 * Provides functions to interact with YouTube API for channel and video data.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const API_KEY = process.env.YOUTUBE_API_KEY;

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  handle: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
}

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string; // formatted like "3:27"
  channelTitle: string;
  channelId: string;
  publishedAt: string; // ISO string
}

/**
 * Extracts YouTube handle from URL or returns the handle as-is
 * @example "@SUPERANT_AN" -> "@SUPERANT_AN"
 * @example "https://www.youtube.com/@SUPERANT_AN" -> "@SUPERANT_AN"
 */
function extractHandle(handleOrUrl: string): string {
  const trimmed = handleOrUrl.trim();

  if (trimmed.startsWith('http')) {
    const match = trimmed.match(/@[\w-]+/);
    if (!match) {
      throw new Error('Invalid YouTube URL: handle not found');
    }
    return match[0];
  }

  // Non-URL input: ensure it starts with '@'
  if (trimmed.startsWith('@')) {
    return trimmed;
  }
  return `@${trimmed}`;
}

/**
 * Resolves a YouTube handle to channel information
 * @param handle - YouTube handle like "@SUPERANT_AN" or URL
 * @returns Channel information including id, title, thumbnail, subscribers, and video count
 */
export async function resolveChannelHandle(handle: string): Promise<YouTubeChannelInfo> {
  if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  const cleanHandle = extractHandle(handle);

  // Remove @ prefix for API call
  const handleForAPI = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;

  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('forHandle', handleForAPI);
  url.searchParams.set('key', API_KEY);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube API error (channels.list): ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`Channel not found for handle: ${cleanHandle}`);
  }

  const channel = data.items[0];

  return {
    id: channel.id,
    title: channel.snippet.title,
    handle: cleanHandle,
    thumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.default?.url,
    subscriberCount: parseInt(channel.statistics.subscriberCount || '0', 10),
    videoCount: parseInt(channel.statistics.videoCount || '0', 10),
  };
}

/**
 * Fetches a single video by ID
 * @param videoId - YouTube video ID
 * @returns Video information or throws if not found / private
 */
export async function fetchVideoById(videoId: string): Promise<YouTubeVideoInfo & { viewCount?: string; publishedAt?: string }> {
  if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', API_KEY);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube API error (videos.list): ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error('영상을 찾을 수 없습니다. 비공개이거나 삭제되었을 수 있습니다.');
  }

  const item = data.items[0];
  const duration = item.contentDetails?.duration ? formatDuration(item.contentDetails.duration) : '0:00';

  return {
    videoId: item.id,
    title: item.snippet?.title ?? '',
    thumbnail: item.snippet?.thumbnails?.maxres?.url ?? item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    duration,
    channelTitle: item.snippet?.channelTitle ?? '',
    channelId: item.snippet?.channelId ?? '',
    publishedAt: item.snippet?.publishedAt,
    viewCount: item.statistics?.viewCount ?? '0',
  };
}

/**
 * Fetches recent videos from a channel
 * @param channelId - YouTube channel ID
 * @param hoursAgo - Number of hours to look back (default: 24)
 * @returns Array of video information with formatted duration
 */
export async function fetchRecentVideos(
  channelId: string,
  hoursAgo: number = 24
): Promise<YouTubeVideoInfo[]> {
  if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  // Calculate publishedAfter timestamp
  const publishedAfter = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  // Step 1: Search for videos
  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('channelId', channelId);
  searchUrl.searchParams.set('publishedAfter', publishedAfter);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('order', 'date');
  searchUrl.searchParams.set('maxResults', '50');
  searchUrl.searchParams.set('key', API_KEY);

  const searchResponse = await fetch(searchUrl.toString());

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    throw new Error(`YouTube API error (search.list): ${searchResponse.status} ${errorText}`);
  }

  const searchData = await searchResponse.json();

  if (!searchData.items || searchData.items.length === 0) {
    return [];
  }

  // Step 2: Get video details (for duration)
  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

  const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  videosUrl.searchParams.set('part', 'contentDetails');
  videosUrl.searchParams.set('id', videoIds);
  videosUrl.searchParams.set('key', API_KEY);

  const videosResponse = await fetch(videosUrl.toString());

  if (!videosResponse.ok) {
    const errorText = await videosResponse.text();
    throw new Error(`YouTube API error (videos.list): ${videosResponse.status} ${errorText}`);
  }

  const videosData = await videosResponse.json();

  // Create a map of videoId -> duration
  const durationMap = new Map<string, string>();
  videosData.items?.forEach((video: any) => {
    durationMap.set(video.id, formatDuration(video.contentDetails.duration));
  });

  // Step 3: Combine data
  const videos: YouTubeVideoInfo[] = searchData.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    duration: durationMap.get(item.id.videoId) || '0:00',
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
  }));

  return videos;
}

/**
 * Formats ISO 8601 duration to human-readable format
 * @param isoDuration - ISO 8601 duration string (e.g., "PT3M27S")
 * @returns Formatted duration (e.g., "3:27")
 * @example "PT3M27S" -> "3:27"
 * @example "PT1H5M30S" -> "1:05:30"
 * @example "PT45S" -> "0:45"
 */
export function formatDuration(isoDuration: string): string {
  // Parse ISO 8601 duration: PT[hours]H[minutes]M[seconds]S
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return '0:00';
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats subscriber count to Korean format
 * @param count - Number of subscribers
 * @returns Formatted string
 * @example 76400000 -> "7,640만"
 * @example 1500 -> "1,500"
 * @example 50000 -> "5만"
 */
export function formatSubscriberCount(count: number): string {
  if (count >= 10000) {
    // Convert to 만 (10,000) units
    const manValue = count / 10000;
    // Format with comma for thousands within 만 units
    if (manValue >= 1000) {
      return `${Math.floor(manValue).toLocaleString('ko-KR')}만`;
    }
    // Show one decimal place if less than 1000만 and has fractional part
    if (manValue % 1 !== 0 && manValue < 1000) {
      return `${manValue.toFixed(1).replace(/\.0$/, '')}만`;
    }
    return `${Math.floor(manValue).toLocaleString('ko-KR')}만`;
  }

  // For numbers less than 10,000, just use thousand separator
  return count.toLocaleString('ko-KR');
}
