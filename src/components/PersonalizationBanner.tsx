import type { DurationInsight } from '../personalization'

interface PersonalizationBannerProps {
  insight: DurationInsight
}

export default function PersonalizationBanner({ insight }: PersonalizationBannerProps) {
  return <p className="personalization-banner">{insight.annotation}</p>
}
