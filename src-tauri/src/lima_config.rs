use serde::{Deserialize, Serialize};
use sysinfo::System;

/// Helper function to skip serializing empty Vec<Option> fields
fn skip_vec_none<T>(vec: &Option<Vec<T>>) -> bool {
    match vec {
        Some(v) => v.is_empty(),
        None => true,
    }
}

/// Image configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Image {
    /// Image location (URL or file path)
    pub location: String,
    /// Architecture (e.g., "aarch64", "x86_64")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arch: Option<String>,
    /// Digest for image verification
    #[serde(skip_serializing_if = "Option::is_none")]
    pub digest: Option<String>,
}

/// Represents a complete Lima configuration file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimaConfig {
    /// Minimum version of Lima required (e.g., "2.0.0")
    #[serde(rename = "minimumLimaVersion", skip_serializing_if = "Option::is_none")]
    pub minimum_lima_version: Option<String>,
    /// VM type (e.g., "vz", "qemu", "krunkit")
    #[serde(rename = "vmType", skip_serializing_if = "Option::is_none")]
    pub vm_type: Option<String>,
    /// CPU configuration (e.g., 4)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpus: Option<u32>,
    /// Memory configuration (e.g., "4GiB", "8GB")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<String>,
    /// Disk configuration (e.g., "100GiB", "50GiB")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk: Option<String>,
    /// Image configurations
    #[serde(skip_serializing_if = "skip_vec_none")]
    pub images: Option<Vec<Image>>,
    /// Mount points configuration
    #[serde(skip_serializing_if = "skip_vec_none")]
    pub mounts: Option<Vec<Mount>>,
    /// Containerd configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub containerd: Option<ContainerdConfig>,
    /// Provisioning scripts
    #[serde(skip_serializing_if = "skip_vec_none")]
    pub provision: Option<Vec<Provision>>,
    /// Health probes
    #[serde(skip_serializing_if = "skip_vec_none")]
    pub probes: Option<Vec<Probe>>,
    /// Files to copy from guest to host
    #[serde(rename = "copyToHost", skip_serializing_if = "skip_vec_none")]
    pub copy_to_host: Option<Vec<CopyToHost>>,
    /// Port forwarding configuration
    #[serde(rename = "portForwards", skip_serializing_if = "skip_vec_none")]
    pub port_forwards: Option<Vec<PortForward>>,
}

/// Mount configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mount {
    /// Mount point location (optional, defaults to inferred)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// Mount point on the host
    #[serde(rename = "mountPoint", skip_serializing_if = "Option::is_none")]
    pub mount_point: Option<String>,
    /// Whether mount is writable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writable: Option<bool>,
}

/// Containerd configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerdConfig {
    /// Whether to install system-wide containerd
    pub system: bool,
    /// Whether to configure user-specific containerd
    pub user: bool,
}

/// Provisioning configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provision {
    /// Provision mode: "system", "user", or "dependency"
    pub mode: String,
    /// Provisioning script
    pub script: String,
}

/// Health probe configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Probe {
    /// Probe description
    pub description: String,
    /// Probe script to execute
    pub script: String,
    /// Hint to display if probe fails
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// File copy from guest to host
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyToHost {
    /// Path in the guest VM
    pub guest: String,
    /// Path on the host (may contain template variables)
    pub host: String,
    /// Whether to delete file on VM stop
    #[serde(rename = "deleteOnStop", skip_serializing_if = "Option::is_none")]
    pub delete_on_stop: Option<bool>,
}

/// Port forwarding configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForward {
    /// Whether guest IP must be zero
    #[serde(rename = "guestIPMustBeZero", skip_serializing_if = "Option::is_none")]
    pub guest_ip_must_be_zero: Option<bool>,
    /// Guest IP address (optional)
    #[serde(rename = "guestIP", skip_serializing_if = "Option::is_none")]
    pub guest_ip: Option<String>,
    /// Guest port (optional when using socket)
    #[serde(rename = "guestPort", skip_serializing_if = "Option::is_none")]
    pub guest_port: Option<u16>,
    /// Guest port range (optional)
    #[serde(rename = "guestPortRange", skip_serializing_if = "Option::is_none")]
    pub guest_port_range: Option<(u16, u16)>,
    /// Guest socket (optional)
    #[serde(rename = "guestSocket", skip_serializing_if = "Option::is_none")]
    pub guest_socket: Option<String>,
    /// Host IP address (optional, defaults to 127.0.0.1)
    #[serde(rename = "hostIP", skip_serializing_if = "Option::is_none")]
    pub host_ip: Option<String>,
    /// Host port (optional when using socket)
    #[serde(rename = "hostPort", skip_serializing_if = "Option::is_none")]
    pub host_port: Option<u16>,
    /// Host port range (optional)
    #[serde(rename = "hostPortRange", skip_serializing_if = "Option::is_none")]
    pub host_port_range: Option<(u16, u16)>,
    /// Host socket (optional)
    #[serde(rename = "hostSocket", skip_serializing_if = "Option::is_none")]
    pub host_socket: Option<String>,
    /// Protocol (e.g., "tcp", "udp", "any")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proto: Option<String>,
    /// Whether to ignore this port forward
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore: Option<bool>,
}

impl Default for LimaConfig {
    fn default() -> Self {
        Self {
            minimum_lima_version: None,
            vm_type: None,
            images: Some(vec![]),
            mounts: Some(vec![]),
            containerd: Some(ContainerdConfig {
                system: false,
                user: false,
            }),
            provision: Some(vec![]),
            probes: Some(vec![]),
            copy_to_host: Some(vec![]),
            port_forwards: Some(vec![]),
            cpus: None,
            memory: None,
            disk: None,
        }
    }
}

impl LimaConfig {
    /// Create a new Lima config with default values
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Read YAML content and parse into LimaConfig
    pub fn from_yaml(content: &str) -> Result<Self, serde_yml::Error> {
        serde_yml::from_str(content)
    }

    /// Convert LimaConfig to YAML string
    #[allow(dead_code)]
    pub fn to_yaml(&self) -> Result<String, serde_yml::Error> {
        serde_yml::to_string(self)
    }

    /// Convert LimaConfig to pretty YAML string
    pub fn to_yaml_pretty(&self) -> Result<String, serde_yml::Error> {
        serde_yml::to_string(self)
    }
}

/// Get the default YoloBox Lima configuration.
/// This creates a VM pre-configured for vibe coding with Claude Code CLI.
/// Installs: claude-code, docker, gh, btop, grep, python3, git, curl, jq
pub fn get_default_yolobox_config<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<LimaConfig, String> {
    // Get system information
    let mut sys = System::new_all();
    sys.refresh_all();

    // Calculate 1/2 of host CPU cores (minimum 1)
    let host_cpus = sys.cpus().len() as u32;
    let vm_cpus = std::cmp::max(1, host_cpus / 2);

    let vm_memory = "2GiB".to_string();

    // Detect host user for docker group setup
    let host_user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .or_else(|_| {
            std::process::Command::new("whoami")
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .map_err(|_| std::env::VarError::NotPresent)
        })
        .unwrap_or_default();

    let base_config = LimaConfig {
        minimum_lima_version: Some("2.0.0".to_string()),
        vm_type: Some("vz".to_string()),
        cpus: Some(vm_cpus),
        memory: Some(vm_memory),
        disk: Some("40GiB".to_string()),
        images: Some(vec![
            Image {
                location: "https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-arm64.img".to_string(),
                arch: Some("aarch64".to_string()),
                digest: None,
            },
            Image {
                location: "https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-amd64.img".to_string(),
                arch: Some("x86_64".to_string()),
                digest: None,
            },
        ]),
        mounts: Some(vec![]),
        containerd: Some(ContainerdConfig {
            system: false,
            user: false,
        }),
        provision: Some(vec![
            // All system-level installs in one script to avoid repeated shell startups.
            // Independent downloads run in parallel where possible.
            Provision {
                mode: "system".to_string(),
                script: format!(
                    r#"#!/bin/bash
set -eux -o pipefail

# --- Phase 1: apt packages ---
apt-get update
apt-get install -y \
  curl git grep jq python3 python3-pip vim wget zsh build-essential

# Set zsh as default shell for the lima user
LIMA_USER="$(getent passwd 1000 | cut -d: -f1 || true)"
if [ -n "$LIMA_USER" ]; then
  chsh -s /usr/bin/zsh "$LIMA_USER"
fi

# GitHub CLI (not available on snap)
if ! command -v gh >/dev/null 2>&1; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update && apt-get install -y gh
fi

# --- Phase 2: snap installs ---
snap install node --classic
snap install btop

# Docker via snap + group setup
snap install docker
getent group docker >/dev/null 2>&1 || groupadd docker
if id "{host_user}" &>/dev/null; then
  usermod -aG docker "{host_user}" || true
fi

# Claude Code CLI — installs to ~/.local/bin as root
if ! command -v claude >/dev/null 2>&1; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
# Copy binary to /usr/local/bin so all users can access it
# (symlinks through /root/ fail because /root is drwx------)
if [ -e /root/.local/bin/claude ] && [ ! -e /usr/local/bin/claude ]; then
  cp "$(readlink -f /root/.local/bin/claude)" /usr/local/bin/claude
fi
"#
                ),
            },
            // starship system install (separate for opt-out filtering)
            Provision {
                mode: "system".to_string(),
                script: r#"#!/bin/bash
set -eux -o pipefail
if ! command -v starship >/dev/null 2>&1; then
  curl -fsSL https://starship.rs/install.sh | sh -s -- --yes
fi
"#.to_string(),
            },
            // starship user activation (separate for opt-out filtering)
            Provision {
                mode: "user".to_string(),
                script: r#"#!/bin/bash
set -eux -o pipefail
# Activate starship for zsh and bash
if command -v starship >/dev/null 2>&1; then
  mkdir -p ~/.config
  grep -q 'eval "$(starship init zsh)"' ~/.zshrc 2>/dev/null || echo 'eval "$(starship init zsh)"' >> ~/.zshrc
  grep -q 'eval "$(starship init bash)"' ~/.bashrc 2>/dev/null || echo 'eval "$(starship init bash)"' >> ~/.bashrc
  # Hide username and hostname (shown by default in SSH sessions)
  if [ ! -f ~/.config/starship.toml ]; then
    cat > ~/.config/starship.toml << 'TOML'
[username]
disabled = true

[hostname]
disabled = true
TOML
  fi
fi
"#.to_string(),
            },
        ]),
        probes: Some(vec![
            Probe {
                description: "claude code cli to be installed".to_string(),
                script: r#"#!/bin/bash
set -eux -o pipefail
if ! timeout 300s bash -c "until command -v claude >/dev/null 2>&1; do sleep 5; done"; then
  echo >&2 "claude code cli is not yet installed"
  exit 1
fi
"#.to_string(),
                hint: Some("Provisioning is still running. Claude Code CLI is being installed.".to_string()),
            },
        ]),
        copy_to_host: Some(vec![]),
        port_forwards: Some(vec![]),
    };

    Ok(base_config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lima_config_from_yaml_to_yaml() {
        let yaml_input = r#"
vmType: "vz"
cpus: 4
memory: "4GiB"
disk: "100GiB"
images:
- location: https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-arm64.img
  arch: aarch64
mounts: []
containerd:
  system: false
  user: false
minimumLimaVersion: 2.0.0
provision:
- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    apt-get update && apt-get install -y btop
"#;

        let config = LimaConfig::from_yaml(yaml_input).expect("Failed to parse YAML");
        assert_eq!(config.vm_type, Some("vz".to_string()));
        assert_eq!(config.cpus, Some(4));
        assert_eq!(config.memory, Some("4GiB".to_string()));

        let yaml_output = config.to_yaml().expect("Failed to serialize to YAML");
        let config2 = LimaConfig::from_yaml(&yaml_output).expect("Failed to parse round-trip YAML");
        assert_eq!(config2.vm_type, config.vm_type);
        assert_eq!(config2.cpus, config.cpus);
    }

    #[test]
    fn test_empty_optional_fields_are_skipped() {
        let config = LimaConfig {
            minimum_lima_version: None,
            vm_type: Some("vz".to_string()),
            images: Some(vec![]),
            cpus: Some(4),
            memory: None,
            disk: None,
            mounts: Some(vec![]),
            containerd: None,
            provision: Some(vec![]),
            probes: Some(vec![]),
            copy_to_host: Some(vec![]),
            port_forwards: Some(vec![]),
        };

        let yaml = config.to_yaml().expect("Failed to serialize");
        assert!(!yaml.contains("images: []"));
        assert!(!yaml.contains("mounts: []"));
        assert!(yaml.contains("vmType: vz"));
        assert!(yaml.contains("cpus: 4"));
    }

    #[test]
    fn test_default_lima_config() {
        let config = LimaConfig::default();
        assert_eq!(config.minimum_lima_version, None);
        assert_eq!(config.vm_type, None);
        assert!(config.images.is_some());
        assert!(config.mounts.is_some());
        assert!(config.containerd.is_some());
        assert!(config.provision.is_some());
        assert!(config.probes.is_some());
        assert!(config.copy_to_host.is_some());
        assert_eq!(config.cpus, None);
        assert_eq!(config.memory, None);
        assert_eq!(config.disk, None);
    }

    #[test]
    fn test_default_yolobox_config() {
        let app = tauri::test::mock_app();
        let config =
            get_default_yolobox_config(app.handle()).expect("Failed to get default config");

        assert_eq!(config.vm_type, Some("vz".to_string()));
        assert_eq!(config.memory, Some("2GiB".to_string()));
        assert_eq!(config.disk, Some("40GiB".to_string()));
        assert!(config.cpus.expect("cpus should be set") >= 1);

        let yaml = config.to_yaml_pretty().expect("Failed to serialize");
        assert!(yaml.contains("claude"));
        assert!(yaml.contains("docker"));
        assert!(yaml.contains("btop"));
        assert!(yaml.contains("gh"));
        assert!(yaml.contains("btop"));
        assert!(yaml.contains("python3"));
    }
}
