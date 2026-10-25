//! Makes a clearly labelled local regression ZIP from owner-supplied files; never executes them.
use spark_core::{archive, maps, Result};
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
};
fn main() -> Result<()> {
    let a: Vec<String> = std::env::args().collect();
    if a.len() != 3 {
        return spark_core::invalid("Usage: qa_zip <corpus-root> <new-output-folder>");
    }
    let corpus = Path::new(&a[1]);
    let root = Path::new(&a[2]);
    fs::create_dir_all(root)?;
    let file = root.join("generated-owner-corpus-regression.zip");
    let mut archive = zip::ZipWriter::new(
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)?,
    );
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for name in ["bloodgulch.map", "ui.map", "bitmaps.map", "sounds.map"] {
        archive
            .start_file(format!("maps/{name}"), options)
            .map_err(|e| spark_core::SparkError::Invalid(e.to_string()))?;
        std::io::copy(
            &mut File::open(corpus.join("Zombie Apocalypse/maps").join(name))?,
            &mut archive,
        )?;
    }
    archive
        .start_file("README-generated-fixture.txt", options)
        .map_err(|e| spark_core::SparkError::Invalid(e.to_string()))?;
    archive.write_all(b"Generated locally for ZIP regression; not a supplied historical ZIP. Game content is not redistributed.")?;
    archive
        .start_file("blocked-execution-fixture.exe", options)
        .map_err(|e| spark_core::SparkError::Invalid(e.to_string()))?;
    archive.write_all(b"INERT TEST DATA; not a real executable")?;
    archive
        .finish()
        .map_err(|e| spark_core::SparkError::Invalid(e.to_string()))?;
    let before = maps::hash_file(&file)?;
    fs::create_dir_all(root.join("library"))?;
    let imported = archive::import_archive(&file, &root.join("library"))?;
    assert_eq!(imported.maps.len(), 2);
    assert_eq!(before, imported.sha256);
    assert_eq!(before, maps::hash_file(&file)?);
    assert_eq!(before, maps::hash_file(&imported.preserved_path)?);
    assert!(!imported
        .root
        .join("content/blocked-execution-fixture.exe")
        .exists());
    let report = serde_json::json!({"kind":"generatedOwnerCorpusZipNotHistorical","status":"PASS","scenarios":2,"sourceHashPreserved":true,"executableExtracted":false,"import":imported});
    fs::write(
        root.join("zip-results.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    println!("{}", file.display());
    Ok(())
}
