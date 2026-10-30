//! Read-only, release-pinned Invader parsing of stable changed H1 loose tags.
//! The validator is not the writer. Launch context never proves write attribution.
use super::core;
use super::*;
use core::native_tag_integrity::{Finding, Report};
use core::working_tag_changes::Hashes;
use std::{collections::BTreeMap, process::Command};
const VALIDATOR_SHA: &str = "02e5f41da7f5dbfade250921869239f8d21c36c336cb0be081a9910dca17aa12";
const VERSION: &str = "Invader 0.55.0.r4134.33518109";
#[derive(Default)]
pub(super) struct Cache {
    results: BTreeMap<String, (String, Finding)>,
}
fn output<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<(String, bool)> {
    std::thread::spawn(move || {
        let mut data = Vec::new();
        let mut cut = false;
        let mut block = [0; 4096];
        loop {
            match reader.read(&mut block) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let room = (512 * 1024usize).saturating_sub(data.len());
                    cut |= n > room;
                    data.extend_from_slice(&block[..n.min(room)]);
                }
            }
        }
        (String::from_utf8_lossy(&data).replace("\r\n", "\n"), cut)
    })
}
pub(super) fn fields(executable: &Path, tags: &Path, relative: &str) -> Reply<(bool, String, bool)> {
    let mut command = Command::new(executable);
    command.args([
        "-t",
        tags.to_str().ok_or("Tag path is not Unicode")?,
        "-L",
        relative,
    ]);
    command
        .current_dir(executable.parent().ok_or("Validator has no directory")?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(error)?;
    let stdout = output(child.stdout.take().ok_or("Missing validator stdout")?);
    let stderr = output(child.stderr.take().ok_or("Missing validator stderr")?);
    let began = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(error)? {
            break Some(status);
        }
        if began.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let (stdout, out_cut) = stdout
        .join()
        .map_err(|_| "Validator stdout reader failed")?;
    let (stderr, err_cut) = stderr
        .join()
        .map_err(|_| "Validator stderr reader failed")?;
    let Some(status) = status else {
        return Ok((
            false,
            "Read-only validator timed out; semantic validity is unverified.".into(),
            true,
        ));
    };
    Ok((
        status.success(),
        if status.success() {
            stdout
        } else {
            stderr.lines().take(4).collect::<Vec<_>>().join(" ")
        },
        out_cut || err_cut,
    ))
}
pub(super) fn installed(state: &AppState, project: &Project) -> Reply<PathBuf> {
    let directory = project_tools(state, project)?
        .invader_directory
        .ok_or("Configure the tested Invader build for live native-structure checks")?;
    let file = directory.join("invader-edit.exe");
    core::reject_links(&file).map_err(error)?;
    if maps::hash_file(&file).map_err(error)? != VALIDATOR_SHA {
        return Err("Configured Invader differs from the tested 0.55.0.r4134.33518109 validator. Live semantic checks are unverified; source/build validation remains available.".into());
    }
    Ok(file)
}
impl Cache {
    pub(super) fn scan(
        &mut self,
        state: &AppState,
        project: &Project,
        root: &Path,
        starting: Option<(&Path, &Hashes)>,
        baseline: &Hashes,
        current: &Hashes,
        report: &mut Report,
        limit: usize,
    ) -> Reply<()> {
        if report.invalid_files > 0 || report.pending_files > 0 {
            return Ok(());
        }
        let changed: Vec<_> = current
            .iter()
            .filter(|(path, hash)| baseline.get(*path) != Some(*hash))
            .collect();
        if changed.is_empty() {
            return Ok(());
        }
        let executable = match installed(state, project) {
            Ok(path) => path,
            Err(detail) => {
                report.semantic_unverified_files += changed.len();
                report.findings.push(Finding {
                    path: "Native validator".into(),
                    state: "unverified".into(),
                    detail,
                });
                return Ok(());
            }
        };
        let mut read = 0;
        for (path, hash) in changed {
            core::safe_relative(path).map_err(error)?;
            if self
                .results
                .get(path)
                .is_none_or(|(known, _)| known != hash)
            {
                if read >= limit {
                    report.pending_files += 1;
                    continue;
                }
                read += 1;
                let file = root.join(core::safe_relative(path).map_err(error)?);
                core::reject_links(&file).map_err(error)?;
                let finding = if fs::metadata(&file).map_err(error)?.len() > 64 * 1024 * 1024 {
                    Finding{path:path.clone(),state:"unverified".into(),detail:"Tag exceeds the 64 MiB live native-parser bound; review/compile it through its native kit.".into()}
                } else {
                    let (valid, values, truncated) = fields(&executable, root, path)?;
                    if maps::hash_file(&file).map_err(error)? != *hash {
                        report.pending_files += 1;
                        continue;
                    }
                    let (state, detail) = if truncated {
                        ("unverified",format!("{VERSION} diagnostic output exceeded its bound or timed out; not accepted as a parser pass."))
                    } else if !valid {
                        ("invalid",format!("{VERSION} rejected the native structure: {values}. Validator identity is separate from the writing tool."))
                    } else if let Some((starting, expected_hashes)) =
                        starting.filter(|(p, _)| p.join(path).is_file())
                    {
                        let trusted = expected_hashes.get(path).is_some_and(|expected| {
                            maps::hash_file(&starting.join(path)).is_ok_and(|h| &h == expected)
                        });
                        let (old_valid, old_values, old_cut) = fields(&executable, starting, path)?;
                        if !trusted || !old_valid || old_cut {
                            ("unverified",format!("{VERSION} parsed this save, but cannot establish a complete comparison against its starting source."))
                        } else if old_values == values {
                            ("equivalent",format!("{VERSION}: exposed typed fields match the starting source. Binary differences alone do not prove corruption. Opaque data is retained separately and still needs review."))
                        } else {
                            ("changed",format!("{VERSION}: native structure parses and exposed typed fields differ from the starting source. Review intentional field changes; parser acceptance is not gameplay proof."))
                        }
                    } else {
                        ("parsed",format!("{VERSION} parsed this save; no immutable starting source is available for field comparison."))
                    };
                    Finding {
                        path: path.clone(),
                        state: state.into(),
                        detail,
                    }
                };
                self.results.insert(path.clone(), (hash.clone(), finding));
            }
            let finding = &self.results[path].1;
            match finding.state.as_str() {
                "invalid" => report.invalid_files += 1,
                "unverified" => report.semantic_unverified_files += 1,
                "equivalent" => {
                    report.native_parser_checked_files += 1;
                    report.equivalent_field_files += 1;
                }
                "changed" => {
                    report.native_parser_checked_files += 1;
                    report.changed_field_files += 1;
                }
                _ => {
                    report.native_parser_checked_files += 1;
                }
            }
            if report.findings.len() < 128 {
                report.findings.push(finding.clone());
            } else {
                report.list_truncated = true;
            }
        }
        Ok(())
    }
}
