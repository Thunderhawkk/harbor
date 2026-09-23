use serde::{Deserialize, Serialize};
#[path = "audio_dsp.rs"]
pub mod dsp;

pub const EQ_FREQUENCIES: [f64; 10] = [
    31.5, 63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MusicAudioSettings {
    pub device: String,
    pub eq_enabled: bool,
    pub eq_bands: [f64; 10],
    pub boost_enabled: bool,
    pub volume_limit: f64,
    pub balance: f64,
    pub auto_headroom: bool,
    pub equipment_label: String,
    pub replay_gain: String,
    pub eq_mode: String,
    pub peq_filters: Vec<dsp::PeqFilter>,
    pub eq_strength: f64,
    pub preamp_db: f64,
    pub crossfeed: f64,
    pub dsp_bypass: bool,
    pub exclusive: bool,
    pub sample_rate: u32,
}

impl Default for MusicAudioSettings {
    fn default() -> Self {
        Self {
            device: "auto".into(),
            eq_enabled: false,
            eq_bands: [0.0; 10],
            boost_enabled: false,
            volume_limit: 1.0,
            balance: 0.0,
            auto_headroom: true,
            equipment_label: String::new(),
            replay_gain: "off".into(),
            eq_mode: "graphic".into(),
            peq_filters: Vec::new(),
            eq_strength: 1.0,
            preamp_db: 0.0,
            crossfeed: 0.0,
            dsp_bypass: false,
            exclusive: false,
            sample_rate: 0,
        }
    }
}

impl MusicAudioSettings {
    pub fn normalized(mut self) -> Self {
        if self.eq_mode != "parametric" {
            self.eq_mode = "graphic".into();
        }
        self.peq_filters.truncate(24);
        for filter in &mut self.peq_filters {
            filter.normalize();
        }
        self.eq_strength = dsp::bounded(self.eq_strength, 0.0, 1.0, 1.0);
        self.preamp_db = dsp::bounded(self.preamp_db, -60.0, 12.0, 0.0);
        self.crossfeed = dsp::bounded(self.crossfeed, 0.0, 1.0, 0.0);
        if ![0, 44100, 48000, 88200, 96000, 176400, 192000].contains(&self.sample_rate) {
            self.sample_rate = 0;
        }
        if self.device.is_empty()
            || self.device.len() > 500
            || self.device.chars().any(char::is_control)
        {
            self.device = "auto".into();
        }
        for gain in &mut self.eq_bands {
            *gain = if gain.is_finite() {
                gain.clamp(-12.0, 12.0)
            } else {
                0.0
            };
        }
        self.volume_limit = if self.boost_enabled && self.volume_limit.is_finite() {
            self.volume_limit.clamp(1.0, 5.0)
        } else {
            1.0
        };
        self.balance = if self.balance.is_finite() {
            self.balance.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        self.equipment_label = self
            .equipment_label
            .chars()
            .filter(|character| !character.is_control())
            .take(100)
            .collect::<String>()
            .trim()
            .to_string();
        if !matches!(self.replay_gain.as_str(), "off" | "track" | "album") {
            self.replay_gain = "off".into();
        }
        self
    }

    pub fn clamp_volume(&self, volume: f64) -> f64 {
        if volume.is_finite() {
            volume.clamp(0.0, self.volume_limit)
        } else {
            0.82
        }
    }

    pub fn filter(&self) -> String {
        if self.dsp_bypass {
            return String::new();
        }
        let mut filters = Vec::new();
        let mut preamp = self.preamp_db;
        if self.eq_enabled && self.eq_mode == "parametric" && self.eq_strength > 0.0 {
            if self.auto_headroom {
                preamp -= dsp::headroom(&self.peq_filters, self.eq_strength);
            }
            for filter in self.peq_filters.iter().filter(|filter| filter.enabled) {
                filters.push(filter.command(self.eq_strength));
            }
        } else if self.eq_enabled
            && self.eq_mode == "graphic"
            && self.eq_bands.iter().any(|gain| gain.abs() >= 0.01)
        {
            let headroom = self.eq_bands.iter().copied().fold(0.0_f64, f64::max);
            if self.auto_headroom && headroom > 0.0 {
                preamp -= headroom;
            }
            for (frequency, gain) in EQ_FREQUENCIES.iter().zip(self.eq_bands) {
                if gain.abs() >= 0.01 {
                    filters.push(format!("equalizer=f={frequency}:t=o:w=1:g={gain:.2}"));
                }
            }
        }
        if preamp.abs() >= 0.01 {
            filters.insert(0, format!("volume={preamp:.2}dB"));
        }
        if self.crossfeed > 0.0 {
            filters.push(format!(
                "crossfeed=strength={:.4}:range=0.5:level_in=1:level_out=1",
                self.crossfeed
            ));
        }
        if self.balance.abs() >= 0.001 {
            let left = 1.0 - self.balance.max(0.0);
            let right = 1.0 + self.balance.min(0.0);
            // Explicit stereo mode; neither side is amplified or mixed into the other.
            filters.push(format!(
                "aformat=channel_layouts=stereo,pan=stereo|c0={left:.3}*c0|c1={right:.3}*c1"
            ));
        }
        if filters.is_empty() {
            String::new()
        } else {
            format!("lavfi=[{}]", filters.join(","))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_is_bypass_and_unity_ceiling() {
        let settings = MusicAudioSettings::default();
        assert_eq!(settings.filter(), "");
        assert_eq!(settings.clamp_volume(5.0), 1.0);
    }
    #[test]
    fn boost_requires_explicit_opt_in_and_is_bounded() {
        let mut settings = MusicAudioSettings::default();
        settings.volume_limit = 5.0;
        assert_eq!(settings.clone().normalized().volume_limit, 1.0);
        settings.boost_enabled = true;
        settings.volume_limit = 99.0;
        assert_eq!(settings.normalized().clamp_volume(99.0), 5.0);
    }
    #[test]
    fn eq_is_bounded_and_positive_gains_have_headroom() {
        let mut settings = MusicAudioSettings::default();
        settings.eq_enabled = true;
        settings.eq_bands[0] = 50.0;
        settings.eq_bands[1] = f64::NAN;
        let settings = settings.normalized();
        assert_eq!(settings.eq_bands[0], 12.0);
        assert_eq!(settings.eq_bands[1], 0.0);
        assert!(settings
            .filter()
            .contains("volume=-12.00dB,equalizer=f=31.5:t=o:w=1:g=12.00"));
    }
    #[test]
    fn balance_attenuates_without_crossfeed_and_manual_labels_are_bounded() {
        let mut settings = MusicAudioSettings::default();
        settings.balance = 0.5;
        assert_eq!(
            settings.filter(),
            "lavfi=[aformat=channel_layouts=stereo,pan=stereo|c0=0.500*c0|c1=1.000*c1]"
        );
        settings.balance = -1.0;
        assert!(settings.filter().contains("c0=1.000*c0|c1=0.000*c1"));
        settings.equipment_label = "x".repeat(200);
        assert_eq!(settings.normalized().equipment_label.len(), 100);
    }

    #[test]
    fn replaygain_is_opt_in_and_rejects_unknown_modes() {
        assert_eq!(MusicAudioSettings::default().replay_gain, "off");
        let mut settings = MusicAudioSettings::default();
        settings.replay_gain = "loud".into();
        assert_eq!(settings.normalized().replay_gain, "off");
    }
}
