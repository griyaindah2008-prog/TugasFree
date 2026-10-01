/* ============================================================
   backup.js — Export & import backup.
   Export: seluruh data (tugas + folder + isi folder termasuk
   foto & file) dibungkus jadi SATU file JSON yang bisa diunduh.
   Import: baca file backup itu, lalu ganti seluruh data saat ini.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- util ---------------- */

  function namaFileBackup() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return 'backup-tugas-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  }

  function blobKeBase64(blob) {
    return new Promise(function (selesai, gagal) {
      var fr = new FileReader();
      fr.onload = function () { selesai(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { gagal(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function base64KeBlob(b64, mime) {
    return fetch('data:' + (mime || 'application/octet-stream') + ';base64,' + b64)
      .then(function (res) { return res.blob(); });
  }

  function unduhBlob(blob, nama) {
    var a = document.createElement('a');
    var u = URL.createObjectURL(blob);
    a.href = u;
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 10000);
  }

  function salinObjek(o) {
    var salinan = {};
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) salinan[k] = o[k];
    }
    return salinan;
  }

  /* ---------------- export ---------------- */

  function exportSemua() {
    toast('Menyiapkan backup…');
    var tasks, folders, items;
    return DB.semua('tasks').then(function (hasil) {
      tasks = hasil;
      return DB.semua('folders');
    }).then(function (hasil) {
      folders = hasil;
      return DB.semua('items');
    }).then(function (hasil) {
      items = hasil;
      /* foto & file (Blob) diubah ke teks base64 supaya muat di JSON */
      return items.reduce(function (janji, it) {
        return janji.then(function () {
          if (it.blob instanceof Blob) {
            return blobKeBase64(it.blob).then(function (b64) {
              it._data = b64;
            });
          }
        });
      }, Promise.resolve());
    }).then(function () {
      var itemsKeluar = items.map(function (it) {
        var salinan = salinObjek(it);
        delete salinan.blob;
        if (it._data) { salinan.data = it._data; delete salinan._data; }
        return salinan;
      });
      var paket = {
        app: 'tugas-app',
        versi: 1,
        waktu: new Date().toISOString(),
        jumlah: { tugas: tasks.length, folder: folders.length, item: items.length },
        tasks: tasks,
        folders: folders,
        items: itemsKeluar
      };
      var blob = new Blob([JSON.stringify(paket)], { type: 'application/json' });
      var nama = namaFileBackup();
      unduhBlob(blob, nama);
      toast('Backup diunduh: ' + nama + ' (' + formatKB(blob.size) + ')');
    }).catch(function (e) {
      toast('Gagal membuat backup: ' + (e && e.message ? e.message : e));
    });
  }

  function formatKB(n) {
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------------- import ---------------- */

  function importDariBerkas(berkas) {
    var paket = null;
    return berkas.text().then(function (teks) {
      paket = JSON.parse(teks);
    }).catch(function () {
      toast('File tidak terbaca — bukan JSON yang valid.');
      return null;
    }).then(function (lanjut) {
      if (lanjut === null) return;
      if (!paket || paket.app !== 'tugas-app' || !Array.isArray(paket.tasks)) {
        toast('File ini bukan backup Pengatur Tugas.');
        return;
      }
      var j = paket.jumlah || {
        tugas: paket.tasks.length,
        folder: (paket.folders || []).length,
        item: (paket.items || []).length
      };
      return konfirmasi({
        judul: 'Pulihkan backup?',
        pesan: 'Seluruh data saat ini akan DIGANTI dengan isi backup (' +
          j.tugas + ' tugas, ' + j.folder + ' folder, ' + j.item + ' item foto/file/catatan). ' +
          'Tindakan ini tidak bisa dibatalkan.',
        ya: 'Pulihkan'
      }).then(function (ok) {
        if (!ok) return;
        toast('Memulihkan data…');
        return DB.kosongkan('tasks')
          .then(function () { return DB.kosongkan('folders'); })
          .then(function () { return DB.kosongkan('items'); })
          .then(function () { return DB.simpanBanyak('tasks', paket.tasks || []); })
          .then(function () { return DB.simpanBanyak('folders', paket.folders || []); })
          .then(function () {
            /* base64 kembali jadi Blob */
            return (paket.items || []).reduce(function (janji, o) {
              return janji.then(function () {
                var salinan = salinObjek(o);
                if (salinan.data) {
                  return base64KeBlob(salinan.data, salinan.mime).then(function (blob) {
                    salinan.blob = blob;
                    delete salinan.data;
                    return DB.simpan('items', salinan);
                  });
                }
                return DB.simpan('items', salinan);
              });
            }, Promise.resolve());
          })
          .then(function () { return App.muatUlang(); })
          .then(function () { toast('Backup berhasil dipulihkan.'); })
          .catch(function (e) {
            toast('Gagal memulihkan: ' + (e && e.message ? e.message : e));
          });
      });
    });
  }

  /* ---------------- API global ---------------- */

  window.Backup = {
    exportSemua: exportSemua,
    importDariBerkas: importDariBerkas
  };
})();
