use crate::protocol::DeviceProfile;

pub fn check_feature_support(profile: &DeviceProfile, feature: crate::protocol::DeviceFeature) -> bool {
    profile.has_feature(feature)
}

pub fn get_unsupported_features(profile: &DeviceProfile) -> Vec<crate::protocol::DeviceFeature> {
    use crate::protocol::DeviceFeature;
    let all = [
        DeviceFeature::ANC,
        DeviceFeature::Transparency,
        DeviceFeature::Adaptive,
        DeviceFeature::WindNoise,
        DeviceFeature::GameMode,
        DeviceFeature::LDAC,
        DeviceFeature::Multipoint,
        DeviceFeature::BassEnhance,
        DeviceFeature::WearingDetection,
        DeviceFeature::EasyChat,
        DeviceFeature::AutoPowerOff,
        DeviceFeature::FindBuds,
        DeviceFeature::EarTipTest,
        DeviceFeature::CustomGestures,
    ];
    all.iter().filter(|f| !profile.has_feature(**f)).cloned().collect()
}
