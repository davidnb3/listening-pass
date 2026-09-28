import { formatHz, formatSigned, formatTime, joinTimes } from './format'
import type { BandReading, Chapter, Fault, Figure, Finding, GroupId, Metrics, Report, Severity } from './types'

const strongKey = 0.7
const strongTempo = 2.5

function note(
  id: string,
  group: GroupId,
  severity: Severity,
  title: string,
  explanation: string,
  tip: string,
  evidence: { label: string; value: string }[],
): Finding {
  return { id, group, severity, title, explanation, tip, evidence }
}

function lufs(value: number): string {
  return `${formatSigned(value)} LUFS`
}

function isSilent(metrics: Metrics): boolean {
  return metrics.samplePeakDbfs < -70 || metrics.integratedLufs < -60
}

function bandById(metrics: Metrics, id: BandReading['id']): BandReading | undefined {
  return metrics.bands.find((band) => band.id === id)
}

function strongestBands(metrics: Metrics): BandReading[] {
  return [...metrics.bands]
    .filter((band) => Math.abs(band.deviationDb) >= 4)
    .sort((a, b) => Math.abs(b.deviationDb) - Math.abs(a.deviationDb))
    .slice(0, 2)
}

function bandSeverity(deviation: number): Severity {
  return Math.abs(deviation) >= 6 ? 'fix' : 'watch'
}

function bandNote(band: BandReading, metrics: Metrics): Finding {
  const over = band.deviationDb > 0
  const capped = Math.abs(band.deviationDb) >= 12
  const amount = capped
    ? `${over ? 'over +12' : 'under -12'} dB`
    : `${formatSigned(band.deviationDb)} dB`
  const evidence = [{ label: band.label, value: amount }]
  const lowMid = bandById(metrics, 'lowMid')
  const severity =
    band.id === 'sub' && over && (lowMid?.deviationDb ?? 0) < 5 ? 'watch' : bandSeverity(band.deviationDb)

  const copy: Record<BandReading['id'], { over: [string, string, string]; under: [string, string, string] }> = {
    sub: {
      over: [
        'The sub is heavy',
        'Energy under 60 Hz is louder than a gentle tilt. On bass-led music that is often the record. A laptop speaker cannot play that octave, so the sub is missing there.',
        'Leave the sub if it is the bass. Check the note still speaks on a small speaker through the harmonics above about 80 Hz. High-pass only the parts that should not be down there.',
      ],
      under: [
        'The sub is light',
        'There is little energy under 60 Hz. The mix can still translate, but it will feel smaller on a system that can actually reproduce sub.',
        'If the record should feel larger, add weight on the bass or the kick, not with a wide boost on the master.',
      ],
    },
    bass: {
      over: [
        'The bass is pushed',
        'The octave around the bass is louder than a balanced tilt. That can be a style. It can also hide the kick and thicken everything above it.',
        'Decide which part owns the low end. A small cut on the other one usually does more than turning the bass down in the master.',
      ],
      under: [
        'The low end is thin',
        'Bass energy is below the rest of the spectrum, so the chorus can sound small once you leave the monitors you mixed on.',
        'A gentle shelf on the bass, or a tighter kick, will do more than boosting the master low end.',
      ],
    },
    lowMid: {
      over: [
        'The low mids are built up',
        'The range around 200 to 400 Hz is loud. Too much energy here is what sounds muddy, on smaller speakers especially, even when it still feels warm in the studio.',
        'Sweep a narrow cut between 200 and 400 Hz on the parts that pile up there, usually guitars, piano, or a dense drum bus.',
      ],
      under: [
        'The low mids are scooped',
        'There is a hole between the bass and the mids, so the mix can sound hollow or disconnected.',
        'Bring back a little body on the parts that should fill the room, rather than adding a wide low-mid boost on the master.',
      ],
    },
    mid: {
      over: [
        'The mids are crowded',
        'The middle of the spectrum is louder than the bands around it. That is where vocals, snare, and guitars already compete.',
        'Give the lead the mids and tuck the supporting parts with a small cut, or move them slightly off center.',
      ],
      under: [
        'The mids are recessed',
        'The center of the spectrum is quieter than the lows and the top. Vocals and snare can sit behind the track even when they are not actually quiet.',
        'A small lift on the vocal or the snare is safer than a wide mid boost on the whole mix.',
      ],
    },
    presence: {
      over: [
        'The presence range is hot',
        'Energy from about 2 to 5 kHz is pushed. This is where a mix turns harsh, especially once it is played louder than the mix position.',
        'Ease 2 to 5 kHz before you add more air. If a vocal is the cause, a dynamic cut there is kinder than a static one.',
      ],
      under: [
        'The presence is shy',
        'The 2 to 5 kHz range is quiet, so the mix can sound dull or distant even when the top octave is open.',
        'A little presence on the vocal or the snare will bring the mix forward without brightening everything.',
      ],
    },
    air: {
      over: [
        'The top end is very open',
        'The air band is louder than the tilt. On bright headphones that becomes brittle, and it shows up more at a low listening level.',
        'A wide, gentle shelf down from 10 kHz is enough. Check it quietly, where brightness is easier to overdo.',
      ],
      under: [
        'The air band is quiet',
        'Above 6 kHz the mix falls away, so it will read as dull on earbuds and laptop speakers.',
        'A small shelf from 10 kHz, or a little excitement on the parts that should shimmer, before you brighten the whole master.',
      ],
    },
  }

  const [title, explanation, tip] = over ? copy[band.id].over : copy[band.id].under
  const subSpendsHeadroom =
    band.id === 'sub' && over && metrics.crestDb < 6 && metrics.loudnessRange < 3
  const writtenTip = subSpendsHeadroom
    ? 'The bass hits are also using most of the headroom. If the limiter grabs on every sub transient, ease those hits. Do not high-pass the bass because a laptop cannot play it.'
    : tip
  return note(`band-${band.id}`, 'frequency', severity, title, explanation, writtenTip, evidence)
}

function dynamicsFindings(metrics: Metrics): Finding[] {
  const findings: Finding[] = []
  const levelEvidence = [
    { label: 'Integrated', value: lufs(metrics.integratedLufs) },
    { label: 'Range', value: `${formatSigned(metrics.loudnessRange)} LU` },
  ]

  const level = metrics.integratedLufs
  const crushed = metrics.loudnessRange < 3 && metrics.crestDb < 6
  if (level <= -6.5 && level >= -9.5) {
    findings.push(
      note(
        'loudness',
        'dynamics',
        'good',
        'Loudness is in a finished-master range',
        'A current master usually sits between −9 and −7 LUFS. Streaming plays back near −14 and turns a louder file down. That reduction is expected. It is not a reason to deliver the master at the playback level.',
        'Judge the chorus against other records at the same monitoring level. Keep true-peak headroom for the encode. Do not master to the platform number.',
        levelEvidence,
      ),
    )
  } else if (level > -6.5 && crushed) {
    findings.push(
      note(
        'loudness',
        'dynamics',
        'watch',
        'The master is hotter than it needs to be, and the peaks are gone',
        'Past about −6 LUFS, with almost no movement left, the limiter has become the sound. Streaming will turn the level down and leave the flattening in place.',
        'Ease the limiter until the integrated level is near −8 LUFS and the chorus can still lift a little. Do not chase −14. That is the playback level, not the master.',
        levelEvidence,
      ),
    )
  } else if (level > -6.5) {
    findings.push(
      note(
        'loudness',
        'dynamics',
        'watch',
        'This is hotter than a finished-master range',
        'Above about −6 LUFS, streaming turns the extra level straight back down. If the peaks still move, the loudness itself is not damage.',
        'Leave it if the record wants to be that hot. You will not hear the extra loudness on the big streaming services.',
        levelEvidence,
      ),
    )
  } else if (level >= -16) {
    findings.push(
      note(
        'loudness',
        'dynamics',
        'watch',
        'This is quieter than a finished-master range',
        'Streaming playback sits near −14 LUFS. A file already around that level is not turned down, but most current masters are delivered between −9 and −7, and the platform turns those down. At −14 the record can sound smaller wherever playback is not normalized.',
        'If this should sit with current pop, electronic, or club records, bring it toward −8 LUFS and stop while the peaks still move. If the dynamics are the point, leave the level alone.',
        levelEvidence,
      ),
    )
  } else {
    findings.push(
      note(
        'loudness',
        'dynamics',
        'watch',
        'This master is quite quiet',
        'This is well below a finished level, and below what streaming will play it at. Normalization turns the whole file up, including the noise floor.',
        'If it is meant to be finished, raise it toward −8 LUFS with a limiter that only catches the peaks. Leave it if the open dynamics are the record.',
        levelEvidence,
      ),
    )
  }

  const moveEvidence = [
    { label: 'Loudness range', value: `${formatSigned(metrics.loudnessRange)} LU` },
    { label: 'Crest', value: `${formatSigned(metrics.crestDb)} dB` },
  ]
  if (metrics.dynamicComplexity !== null) {
    moveEvidence.push({
      label: 'Movement',
      value: formatSigned(metrics.dynamicComplexity),
    })
  }

  if (metrics.loudnessRange < 2.5 && metrics.crestDb < 5) {
    findings.push(
      note(
        'movement',
        'dynamics',
        'watch',
        'The dynamics are flattened',
        'Loudness barely moves, and the crest between the true peak and the average level is small. The limiter is doing the musical work.',
        'Back the limiter and the bus compressor off before you reach for more. Punch returns when the peaks have somewhere to go.',
        moveEvidence,
      ),
    )
  } else if (metrics.loudnessRange >= 8 && metrics.crestDb >= 12) {
    findings.push(
      note(
        'movement',
        'dynamics',
        'good',
        'The peaks still have room',
        'Loudness moves across the song, and the crest is high enough that attacks are not pinned to the ceiling.',
        'If a chorus should feel bigger, automate into it. More compression on the whole master would spend the range you still have.',
        moveEvidence,
      ),
    )
  } else {
    findings.push(
      note(
        'movement',
        'dynamics',
        'good',
        'Dynamics are in a moderate range',
        'The song is neither pinned nor wildly open. Transients still exist, and the level does not wander so far that the quiet parts disappear.',
        'Leave this alone unless a specific section feels stuck. A global compressor would be a blunt way to fix one moment.',
        moveEvidence,
      ),
    )
  }

  if (metrics.clippedSamples >= 3) {
    findings.push(
      note(
        'ceiling',
        'dynamics',
        'fix',
        'The file is clipping',
        'Samples are hitting full scale, so those waveform tops are already flat. The distortion is in the file, before any streaming encoder touches it.',
        'Lower the master until nothing touches 0 dBFS. If only one hit clips, turn that hit down rather than the whole song.',
        [
          { label: 'Clipped samples', value: metrics.clippedSamples.toLocaleString('en-US') },
          ...peakEvidence(metrics),
        ],
      ),
    )
  } else if (metrics.truePeakDbtp > -0.5) {
    findings.push(
      note(
        'ceiling',
        'dynamics',
        'watch',
        'True peak sits above full scale',
        'The stored samples are still clean, which is why this often does not sound distorted. The waveform between them rises above 0 dBTP, and a later MP3 or AAC encode can clip that overshoot. On a loud commercial master, a reading around +1 dBTP is common.',
        'If you are exporting, set the limiter ceiling near −1 dBTP. If this file is already finished and it sounds clean, leave it.',
        peakEvidence(metrics),
      ),
    )
  } else if (metrics.truePeakDbtp > -1) {
    findings.push(
      note(
        'ceiling',
        'dynamics',
        'watch',
        'True peak is close to the ceiling',
        'There is less than 1 dB of true-peak headroom. That is tight for a file that will be encoded again by a streaming service.',
        'Give the limiter another half decibel of ceiling. The loudness change is small. The extra safety is not.',
        peakEvidence(metrics),
      ),
    )
  } else {
    findings.push(
      note(
        'ceiling',
        'dynamics',
        'good',
        'True peak has headroom',
        'The intersample peak sits at or under −1 dBTP, which is the usual margin before a stream encodes the file.',
        'Keep the limiter ceiling there on the next export. It is easier to hold than to win back after a file has already clipped.',
        peakEvidence(metrics),
      ),
    )
  }

  const peaks = metrics.markers.filter((marker) => marker.kind === 'peak')
  if (peaks.length > 0) {
    findings.push(
      note(
        'peaks',
        'dynamics',
        metrics.clippedSamples >= 3 ? 'watch' : 'good',
        'The loud passages are marked on the timeline',
        `Short-term loudness peaks around ${joinTimes(peaks.map((peak) => peak.time))}. Those are the moments the master is working hardest.`,
        'If one of them sounds pinched, ease the limiter there. A change to the whole song would turn the quiet sections down with it.',
        peaks.map((peak) => ({
          label: formatTime(peak.time),
          value: lufs(peak.value),
        })),
      ),
    )
  }

  findings.push(...faultNotes(metrics))
  return findings
}

function faultNotes(metrics: Metrics): Finding[] {
  const notes: Finding[] = []
  const listed = (kind: Fault['kind'], max: number) => {
    const found = metrics.faults.filter((fault) => fault.kind === kind)
    return found.length > 0 && found.length <= max ? found : []
  }
  const clicks = listed('click', 6)
  if (clicks.length > 0) {
    notes.push(
      note(
        'clicks',
        'dynamics',
        'watch',
        'A few clicks sit in the file',
        'Short impulses show up that are sharper than the music around them. They are easy to miss until a quiet moment arrives.',
        'Solo those spots and cut the click, or run a declicker on that region only. A declicker across the whole mix will dull the transients.',
        [{ label: 'Times', value: joinTimes(clicks.map((fault) => fault.time)) }],
      ),
    )
  }
  const dropouts = listed('dropout', 6)
  if (dropouts.length > 0) {
    notes.push(
      note(
        'dropouts',
        'dynamics',
        'watch',
        'There is a digital glitch',
        'The waveform jumps in a way a performance does not. It is usually an edit, a dropout, or a bad export.',
        'Listen at those times with the master bypassed. Repair the edit in the session rather than smoothing it on the master.',
        [{ label: 'Times', value: joinTimes(dropouts.map((fault) => fault.time)) }],
      ),
    )
  }
  const gaps = listed('gap', 4)
  if (gaps.length > 0) {
    notes.push(
      note(
        'gaps',
        'dynamics',
        'watch',
        'The signal drops out',
        'The level falls away and comes back, shorter than a rest and quieter than the music on either side.',
        'Check the edit or the bounce around those times. A hole this short is rarely the arrangement.',
        gaps.slice(0, 4).map((fault) => ({
          label: formatTime(fault.time),
          value: `${fault.seconds.toFixed(2)} s`,
        })),
      ),
    )
  }
  const bursts = listed('burst', 4)
  if (bursts.length > 0) {
    notes.push(
      note(
        'bursts',
        'dynamics',
        'watch',
        'A noise burst pokes through',
        'A short patch of noise rises above the signal. It may be a buffer slip, a ground problem, or a sample that starts dirty.',
        'Find the region and replace it. A broadband denoise on the master will take the air with it.',
        [{ label: 'Times', value: joinTimes(bursts.map((fault) => fault.time)) }],
      ),
    )
  }
  const lead = metrics.faults.find((fault) => fault.kind === 'silence' && fault.edge === 'start')
  if (lead) {
    notes.push(
      note(
        'silence-start',
        'dynamics',
        'watch',
        'Silence leads the file',
        `About ${lead.seconds.toFixed(1)} seconds pass before the music starts. Streaming players and playlists will sit in that gap.`,
        'Trim the top if the silence is only an export handle. Leave it if the song is supposed to begin late.',
        [{ label: 'Lead', value: `${lead.seconds.toFixed(1)} s` }],
      ),
    )
  }
  const tail = metrics.faults.find((fault) => fault.kind === 'silence' && fault.edge === 'end')
  if (tail) {
    notes.push(
      note(
        'silence-end',
        'dynamics',
        'watch',
        'The file holds after the song',
        `About ${tail.seconds.toFixed(1)} seconds of silence remain after the music. The track will feel longer than it is.`,
        'Trim the tail on export, and leave a short fade if the reverb still needs to end.',
        [{ label: 'Tail', value: `${tail.seconds.toFixed(1)} s` }],
      ),
    )
  }
  return notes
}

function frequencyFindings(metrics: Metrics): Finding[] {
  const findings: Finding[] = []
  const outliers = strongestBands(metrics)
  if (outliers.length === 0) {
    findings.push(
      note(
        'tilt',
        'frequency',
        'good',
        'The spectrum sits close to a balanced tilt',
        'None of the six bands, from sub through air, is far from a gentle downward slope. Nothing here is asking for a big equalization move.',
        'Small tastes are still musical. This pass only flags imbalances a listener would hear on another pair of speakers.',
        [{ label: 'Centroid', value: formatHz(metrics.centroidHz) }],
      ),
    )
  } else {
    for (const band of outliers) findings.push(bandNote(band, metrics))
  }

  const presence = bandById(metrics, 'presence')
  const rough =
    metrics.dissonance !== null &&
    metrics.dissonance >= 0.2 &&
    (presence?.deviationDb ?? 0) >= 3
  if (rough) {
    findings.push(
      note(
        'rough',
        'frequency',
        'watch',
        'The upper mids are rough as well as loud',
        'The presence range is pushed, and the partials up there beat against each other. That is the harshness that shows up on earbuds even when the studio monitors still feel fine.',
        'A dynamic cut around the harsh spot, riding only when it jumps out, keeps the vocal present without sanding off the whole top end.',
        [{ label: 'Roughness', value: formatSigned(metrics.dissonance ?? 0, 2) }],
      ),
    )
  }

  for (const peak of metrics.resonances) {
    findings.push(
      note(
        `resonance-${Math.round(peak.hz)}`,
        'frequency',
        peak.prominenceDb >= 9 ? 'fix' : 'watch',
        `A narrow peak sits near ${formatHz(peak.hz)}`,
        `It stands about ${formatSigned(peak.prominenceDb, 0)} dB above the spectrum around it. A peak that narrow is usually a resonance, not the tone of the song.`,
        'A cut of two or three decibels, with a narrow Q, is enough. A wide cut will take the body of the mix with it.',
        [{ label: 'Frequency', value: formatHz(peak.hz) }],
      ),
    )
  }

  return findings
}

function spaceFindings(metrics: Metrics): Finding[] {
  const findings: Finding[] = []
  const correlationEvidence = [
    { label: 'Correlation', value: formatSigned(metrics.correlation, 2) },
    { label: 'Width', value: formatSigned(metrics.width, 2) },
  ]

  if (metrics.mono) {
    findings.push(
      note(
        'image',
        'space',
        'good',
        'This file is mono',
        'There is no difference between the left and the right, so there is no stereo image to judge. What you hear is the whole mix, in one place.',
        'If the mix was stereo before export, the export folded it. If it was always mono, any width has to be made on purpose, and kept off the bass and the lead.',
        correlationEvidence,
      ),
    )
  } else if (metrics.correlation < 0.15) {
    findings.push(
      note(
        'image',
        'space',
        'fix',
        'The left and right are working against each other',
        'Phase correlation is low. Summed to mono, parts of this mix will thin out or nearly disappear. That is how it will sound on a phone speaker and plenty of club systems.',
        'Solo the wide effects and the duplicated tracks in mono. The usual cause is a stereo widener, a Haas delay, or a synth that is stereo in the bass.',
        correlationEvidence,
      ),
    )
  } else if (metrics.correlation < 0.35 || metrics.width > 0.28) {
    findings.push(
      note(
        'image',
        'space',
        'watch',
        'The image is very wide',
        'A lot of the energy lives in the sides. That can feel impressive in headphones and fragile once the mix is summed or played in a room.',
        'Check a mono fold before you add any more width. Keep the lead and the bass closer to the center than the ear-candy.',
        correlationEvidence,
      ),
    )
  } else if (metrics.correlation > 0.92 && metrics.width < 0.05) {
    findings.push(
      note(
        'image',
        'space',
        'watch',
        'The mix is nearly mono',
        'Left and right are almost the same signal. Everything is sharing one small space in the center.',
        'If that is not the intent, open the supporting parts with a little pan, room, or a double. Leave the vocal and the bass where they are.',
        correlationEvidence,
      ),
    )
  } else {
    findings.push(
      note(
        'image',
        'space',
        'good',
        'The stereo image is stable',
        'Correlation and width sit in a range that usually survives a mono fold without the mix collapsing.',
        'Use the timeline marks, if any, rather than a global widener. A dip in one section is a local problem.',
        correlationEvidence,
      ),
    )
  }

  const dips = metrics.markers.filter((marker) => marker.kind === 'phase')
  if (!metrics.mono && dips.length > 0 && metrics.correlation >= 0.15) {
    findings.push(
      note(
        'dips',
        'space',
        dips.some((dip) => dip.value < 0) ? 'fix' : 'watch',
        'Phase dips in a few passages',
        `Correlation falls off around ${joinTimes(dips.map((dip) => dip.time))}. The rest of the song can be fine while those moments hollow out in mono.`,
        'Solo each of those spots in mono. Look first at a wide effect, a delayed double, or a stereo synth that enters only there.',
        dips.map((dip) => ({
          label: formatTime(dip.time),
          value: formatSigned(dip.value, 2),
        })),
      ),
    )
  }

  if (metrics.lowEndWidth > 0.18) {
    findings.push(
      note(
        'low-end',
        'space',
        'fix',
        'The bass is too wide',
        'Below about 120 Hz there is a lot of side energy. Low frequencies that disagree between left and right wander, and they cancel when the mix is summed.',
        'Narrow everything under about 120 Hz to mono. Keep the width higher up, where it does not pull the low end apart.',
        [{ label: 'Low-end width', value: formatSigned(metrics.lowEndWidth, 2) }],
      ),
    )
  } else if (metrics.lowEndWidth > 0.1) {
    findings.push(
      note(
        'low-end',
        'space',
        'watch',
        'The low end is wider than it needs to be',
        'Some side energy is leaking under 120 Hz. A little is harmless. More than that and the bass stops sitting still.',
        'Mono the bass and the kick, or high-pass the side channel. Leave the width on the parts that live above the bass.',
        [{ label: 'Low-end width', value: formatSigned(metrics.lowEndWidth, 2) }],
      ),
    )
  } else {
    findings.push(
      note(
        'low-end',
        'space',
        'good',
        'The low end is centered',
        'Below about 120 Hz the sides are quiet, so the bass stays put when the mix is summed to mono.',
        'Keep it that way. Width belongs on the mids and the air, not on the kick and the bass.',
        [{ label: 'Low-end width', value: formatSigned(metrics.lowEndWidth, 2) }],
      ),
    )
  }

  if (Math.abs(metrics.balance) >= 0.12) {
    const side = metrics.balance > 0 ? 'right' : 'left'
    findings.push(
      note(
        'balance',
        'space',
        Math.abs(metrics.balance) >= 0.22 ? 'fix' : 'watch',
        `The ${side} side is louder`,
        'The two channels are not carrying the same level. A listener in the middle hears the image lean, and a quick pan-pot check will show it.',
        'Find the part that is panned hard and sitting too hot, or a stereo effect that is biased to one side. Balance the level before you reach for a master width tool.',
        [{ label: 'Balance', value: formatSigned(metrics.balance, 2) }],
      ),
    )
  }

  const crowded = metrics.bands.find(
    (band) =>
      (band.id === 'lowMid' || band.id === 'mid' || band.id === 'presence') &&
      band.deviationDb >= 5 &&
      metrics.correlation > 0.8 &&
      metrics.width < 0.08,
  )
  if (crowded && !metrics.mono) {
    findings.push(
      note(
        'crowd',
        'space',
        'watch',
        'Loud parts are stacked in the center',
        `The ${crowded.label.toLowerCase()} band is hot, and almost all of the mix is parked in the middle. Those elements are competing for the same space.`,
        'Pan or widen the supporting parts, and leave the lead in the center. Then let each part own a slice of that band instead of all of them boosting it.',
        [{ label: crowded.label, value: `${formatSigned(crowded.deviationDb)} dB` }],
      ),
    )
  }

  return findings
}

function openingLine(metrics: Metrics): string {
  if (isSilent(metrics)) {
    return 'This file is essentially silent, so there is no mix here to judge yet.'
  }
  if (metrics.clippedSamples >= 3) {
    return 'This mix is clipping. The loudest peaks are already flattened in the file.'
  }
  if (!metrics.mono && metrics.correlation < 0.15) {
    return 'Parts of this mix are out of phase, so it will thin out when it is played in mono.'
  }
  if (metrics.integratedLufs > -6.5 && metrics.loudnessRange < 3 && metrics.crestDb < 6) {
    return 'This master is pushed past a useful loudness, and the peaks have little room left.'
  }
  const worst = strongestBands(metrics)[0]
  if (worst && Math.abs(worst.deviationDb) >= 6) {
    if (worst.id === 'lowMid' && worst.deviationDb > 0) {
      return 'The low mids are built up. That warmth will read as mud once you leave this room.'
    }
    if (worst.id === 'presence' && worst.deviationDb > 0) {
      return 'The presence range is hot. This mix will turn harsh when it is played louder.'
    }
    if (worst.id === 'sub' && worst.deviationDb > 0) {
      return 'The sub is heavier than the rest of the tilt. On bass-led music that is often the point.'
    }
    if (worst.deviationDb > 0) {
      return `The ${worst.label.toLowerCase()} is carrying more than its share of the mix.`
    }
    return `The ${worst.label.toLowerCase()} is thin compared with the rest of the spectrum.`
  }
  if (!metrics.mono && metrics.correlation > 0.92 && metrics.width < 0.05) {
    return 'The image is nearly mono, so the elements are sharing one small space.'
  }
  if (metrics.integratedLufs < -16) {
    return 'This is quieter than a finished-master range. Where playback is normalized, the noise floor comes up with it.'
  }
  return 'This sits comfortably. Loudness, tone, and the stereo image are close to a balanced modern mix.'
}

function sentence(title: string): string {
  return title.endsWith('.') ? title : `${title}.`
}

function dynamicsVerdict(findings: Finding[]): string {
  const ceiling = findings.find((item) => item.id === 'ceiling')
  const level = findings.find((item) => item.id === 'loudness')
  const movement = findings.find((item) => item.id === 'movement')
  if (ceiling?.severity === 'fix') return sentence(ceiling.title)
  if (level && level.severity !== 'good') return sentence(level.title)
  if (movement?.severity === 'watch') return 'The level is controlled, and the dynamics have been flattened.'
  if (ceiling?.severity === 'watch') return sentence(ceiling.title)
  if (level?.severity === 'good' && movement?.severity === 'good') {
    return 'Level, movement, and headroom are all in a workable range.'
  }
  return 'The dynamics are workable, with one thing worth a second listen.'
}

function frequencyVerdict(findings: Finding[]): string {
  const bands = findings.filter((item) => item.id.startsWith('band-'))
  if (bands.length === 0 && findings.every((item) => item.severity === 'good')) {
    return 'The tone is close to a balanced tilt, with no band asking for a rescue.'
  }
  const first = bands[0]
  const second = bands[1]
  if (first && second) {
    return `${sentence(first.title).replace(/\.$/, '')}, and ${second.title.charAt(0).toLowerCase()}${second.title.slice(1)}.`
  }
  if (first) return sentence(first.title)
  const resonance = findings.find((item) => item.id.startsWith('resonance'))
  if (resonance) return sentence(resonance.title)
  return 'The broad tilt is fine. A narrower detail is worth a look.'
}

function spaceVerdict(metrics: Metrics, findings: Finding[]): string {
  const image = findings.find((item) => item.id === 'image')
  const low = findings.find((item) => item.id === 'low-end')
  if (metrics.mono) return 'There is no stereo image in this file.'
  if (image?.severity === 'fix') return image.title + '.'
  if (low?.severity === 'fix') return 'The image may be fine higher up, but the bass is too wide.'
  if (image?.severity === 'watch') return image.title + '.'
  if (low?.severity === 'watch') return 'The stereo field is usable, and the bass could sit tighter.'
  if (findings.some((item) => item.id === 'dips')) return 'The image is mostly stable, with a few moments that fall apart.'
  return 'Width, bass, and balance leave the mix enough room.'
}

function silenceReport(metrics: Metrics): Report {
  const finding = note(
    'silence',
    'dynamics',
    'watch',
    'There is almost no signal',
    'The file never rises to a level a listener would call a mix. Loudness, tone, and width cannot be judged from silence.',
    'Export the song rather than an empty region, and run the pass again.',
    [{ label: 'Peak', value: `${formatSigned(metrics.samplePeakDbfs)} dBFS` }],
  )
  return {
    opening: openingLine(metrics),
    figures: figuresFor(metrics),
    chapters: [
      { id: 'dynamics', label: 'Dynamics', verdict: 'There is nothing here to measure yet.', findings: [finding] },
      {
        id: 'frequency',
        label: 'Frequency',
        verdict: 'A silent file has no spectrum to balance.',
        findings: [],
      },
      {
        id: 'space',
        label: 'Space',
        verdict: 'A silent file has no image to place.',
        findings: [],
      },
    ],
    metrics,
  }
}

function peakEvidence(metrics: Metrics): { label: string; value: string }[] {
  return [
    { label: 'Peak', value: `${formatSigned(metrics.samplePeakDbfs)} dBFS` },
    { label: 'True peak', value: `${formatSigned(metrics.truePeakDbtp)} dBTP` },
  ]
}

function peakFigure(metrics: Metrics): Figure {
  return { label: 'Peak', value: formatSigned(metrics.samplePeakDbfs), unit: 'dBFS' }
}

/** Older saved reports measured the sample peak and never printed it. */
export function visibleFigures(report: Report): Figure[] {
  if (report.figures.some((figure) => figure.label === 'Peak')) return report.figures
  if (!Number.isFinite(report.metrics.samplePeakDbfs)) return report.figures
  const peak = peakFigure(report.metrics)
  const index = report.figures.findIndex((figure) => figure.label === 'True peak')
  if (index < 0) return [...report.figures, peak]
  return [...report.figures.slice(0, index), peak, ...report.figures.slice(index)]
}

function figuresFor(metrics: Metrics): Report['figures'] {
  const figures: Report['figures'] = [
    { label: 'Integrated', value: formatSigned(metrics.integratedLufs), unit: 'LUFS' },
    { label: 'Range', value: formatSigned(metrics.loudnessRange), unit: 'LU' },
    peakFigure(metrics),
    { label: 'True peak', value: formatSigned(metrics.truePeakDbtp), unit: 'dBTP' },
    { label: 'Correlation', value: formatSigned(metrics.correlation, 2), unit: '' },
  ]
  const key = metrics.key
  if (key && key.strength >= strongKey) {
    figures.push({ label: 'Key', value: key.name, unit: key.scale })
  }
  const tempo = metrics.tempo
  if (tempo && tempo.confidence >= strongTempo) {
    const unit = tempo.alternate ? `BPM · ${tempo.alternate}` : 'BPM'
    figures.push({ label: 'Tempo', value: String(Math.round(tempo.bpm)), unit })
  }
  return figures
}

export function buildReport(metrics: Metrics): Report {
  if (isSilent(metrics)) return silenceReport(metrics)
  const dynamics = dynamicsFindings(metrics)
  const frequency = frequencyFindings(metrics)
  const space = spaceFindings(metrics)
  const chapters: Chapter[] = [
    {
      id: 'dynamics',
      label: 'Dynamics',
      verdict: dynamicsVerdict(dynamics),
      findings: dynamics,
    },
    {
      id: 'frequency',
      label: 'Frequency',
      verdict: frequencyVerdict(frequency),
      findings: frequency,
    },
    {
      id: 'space',
      label: 'Space',
      verdict: spaceVerdict(metrics, space),
      findings: space,
    },
  ]
  return {
    opening: openingLine(metrics),
    figures: figuresFor(metrics),
    chapters,
    metrics,
  }
}
