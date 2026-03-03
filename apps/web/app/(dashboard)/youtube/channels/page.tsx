import { getAllChannels } from "@/lib/db/channels";
import { ChannelsView } from "./ChannelsView";

export default async function YoutubeChannelsPage() {
  const channels = await getAllChannels();
  return <ChannelsView initialChannels={channels} />;
}
