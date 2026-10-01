/* ============================================================
   folders.js — Folder bertingkat (bisa ada folder di dalam
   folder), galeri isi folder: foto (dikompres otomatis + bisa
   diberi catatan), file, catatan teks, daftar tugas yang
   tertaut, serta Lightbox foto yang dipakai bersama oleh
   folder & tugas.
   ============================================================ */
(function () {
  'use strict';

  var SISI_MAKS_FOTO = 1600;   /* piksel terpanjang setelah kompres */
  var KUALITAS_JPEG = 0.82;
  var BATAS_KECIL = 300 * 1024; /* foto di bawah 300 KB tidak dikompres ulang */

  var state = { daftar: [], aktif: null, items: [] };
  var kolamURL = [];   /* object URL aktif agar bisa direvoke */

  var formFolder = document.getElementById('form-folder');
  var formCatatan = document.getElementById('form-catatan');

  /* ikon SVG kecil untuk konten yang dirender lewat JS */
  var IKON = {
    hapus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    unduh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/></svg>',
    file: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    tambah: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  /* ================= util ================= */

  function urlObjek(blob) {
    var u = URL.createObjectURL(blob);
    kolamURL.push(u);
    return u;
  }
  function bersihkanURL() {
    while (kolamURL.length) URL.revokeObjectURL(kolamURL.pop());
  }

  function formatUkuran(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* Kompres foto otomatis: sisi terpanjang dibatasi, dikonversi
     jadi JPEG berkualitas 82%. Foto yang sudah kecil dibiarkan. */
  function kompresFoto(berkas) {
    if (!berkas.type || berkas.type.indexOf('image/') !== 0 || typeof createImageBitmap !== 'function') {
      return Promise.resolve({ blob: berkas, berubah: false });
    }
    return createImageBitmap(berkas).then(function (bitmap) {
      var sisi = Math.max(bitmap.width, bitmap.height);
      var skala = Math.min(1, SISI_MAKS_FOTO / sisi);
      if (skala === 1 && berkas.size <= BATAS_KECIL) {
        if (bitmap.close) bitmap.close();
        return { blob: berkas, berubah: false };
      }
      var w = Math.max(1, Math.round(bitmap.width * skala));
      var h = Math.max(1, Math.round(bitmap.height * skala));
      var kanvas = document.createElement('canvas');
      kanvas.width = w;
      kanvas.height = h;
      kanvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      return new Promise(function (selesai) {
        kanvas.toBlob(function (blob) {
          if (!blob || blob.size >= berkas.size) selesai({ blob: berkas, berubah: false });
          else selesai({ blob: blob, berubah: true });
        }, 'image/jpeg', KUALITAS_JPEG);
      });
    }).catch(function () {
      return { blob: berkas, berubah: false }; /* format aneh (mis. HEIC) -> simpan asli */
    });
  }

  /* dipakai juga untuk foto milik tugas (tasks.js) */
  window.kompresFoto = kompresFoto;

  /* ============ Lightbox foto (dipakai folder & tugas) ============ */

  var Lightbox = (function () {
    var fotos = [];
    var idx = 0;
    var url = '';
    var segarFn = null;   /* dipanggil setelah catatan foto disimpan */
    var sedangEdit = false;

    function kotak() { return document.getElementById('lightbox'); }

    function buka(daftar, i, segar) {
      fotos = (daftar || []).filter(function (f) { return f.blob instanceof Blob; });
      if (!fotos.length) return;
      segarFn = typeof segar === 'function' ? segar : null;
      idx = Math.min(Math.max(i || 0, 0), fotos.length - 1);
      sedangEdit = false;
      document.getElementById('lb-form-catatan').hidden = true;
      kotak().classList.add('buka');
      tampil();
    }

    function tampil() {
      var f = fotos[idx];
      if (!f) { tutup(); return; }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(f.blob);
      var img = document.getElementById('lb-img');
      img.src = url;
      img.alt = f.caption || f.name || 'Foto';
      document.getElementById('lb-nama').textContent = f.name || 'Foto';
      document.getElementById('lb-angka').textContent = (idx + 1) + ' / ' + fotos.length;
      document.getElementById('lb-prev').hidden = fotos.length < 2;
      document.getElementById('lb-next').hidden = fotos.length < 2;
      perbaruiTeksCatatan(f);
    }

    function perbaruiTeksCatatan(f) {
      var teks = document.getElementById('lb-teks-catatan');
      var tombol = document.getElementById('lb-edit-btn');
      var label = document.getElementById('lb-edit-teks');
      teks.textContent = (f && f.caption) || '';
      teks.hidden = !f || !f.caption || sedangEdit;
      tombol.hidden = sedangEdit;
      tombol.title = (f && f.caption) ? 'Edit catatan foto' : 'Beri catatan foto';
      if (label) label.textContent = (f && f.caption) ? 'Edit catatan' : 'Catat foto';
    }

    function mulaiEdit() {
      var f = fotos[idx];
      if (!f) return;
      sedangEdit = true;
      document.getElementById('lb-form-catatan').hidden = false;
      document.getElementById('lb-input-catatan').value = f.caption || '';
      perbaruiTeksCatatan(f);
      setTimeout(function () { document.getElementById('lb-input-catatan').focus(); }, 40);
    }

    function batalEdit() {
      sedangEdit = false;
      document.getElementById('lb-form-catatan').hidden = true;
      perbaruiTeksCatatan(fotos[idx]);
    }

    function simpanCatatan() {
      var f = fotos[idx];
      if (!f) return;
      f.caption = document.getElementById('lb-input-catatan').value.trim();
      DB.simpan('items', f).then(function () {
        sedangEdit = false;
        document.getElementById('lb-form-catatan').hidden = true;
        perbaruiTeksCatatan(f);
        if (segarFn) { try { segarFn(); } catch (e) { /* abaikan */ } }
        toast('Catatan foto disimpan.');
      }).catch(function () { toast('Gagal menyimpan catatan foto.'); });
    }

    function geser(arah) {
      var n = fotos.length;
      if (!n) return;
      idx = (idx + arah + n) % n;
      if (sedangEdit) batalEdit();
      tampil();
    }

    function tutup() {
      if (url) URL.revokeObjectURL(url);
      url = '';
      fotos = [];
      segarFn = null;
      sedangEdit = false;
      var k = kotak();
      if (k) k.classList.remove('buka');
      var form = document.getElementById('lb-form-catatan');
      if (form) form.hidden = true;
    }

    /* Escape: batalkan edit catatan dulu, baru tutup lightbox */
    function tekanEscape() {
      if (sedangEdit) { batalEdit(); return; }
      tutup();
    }

    function pasangEvent() {
      document.getElementById('lb-tutup').addEventListener('click', tutup);
      document.getElementById('lb-prev').addEventListener('click', function () { geser(-1); });
      document.getElementById('lb-next').addEventListener('click', function () { geser(1); });
      kotak().addEventListener('click', function (e) {
        if (e.target === kotak()) tutup();
      });
      document.getElementById('lb-edit-btn').addEventListener('click', mulaiEdit);
      document.getElementById('lb-batal-catatan').addEventListener('click', batalEdit);
      document.getElementById('lb-form-catatan').addEventListener('submit', function (e) {
        e.preventDefault();
        simpanCatatan();
      });
    }

    return {
      buka: buka,
      geser: geser,
      tutup: tutup,
      tekanEscape: tekanEscape,
      pasangEvent: pasangEvent
    };
  })();

  window.Lightbox = Lightbox;

  /* ================= struktur folder bertingkat ================= */

  function anakDari(id) {
    return state.daftar.filter(function (f) { return f.parentId === id; });
  }

  /* semua folder di bawah folder ini (anak, cucu, dst.) */
  function kumpulkanKeturunan(id) {
    var hasil = [];
    (function kumpul(pid) {
      anakDari(pid).forEach(function (a) {
        hasil.push(a);
        kumpul(a.id);
      });
    })(id);
    return hasil;
  }

  /* nama lengkap dengan jalur: "Induk / Anak" */
  function jalurNama(id) {
    var bagian = [];
    var f = id ? cari(id) : null;
    var pengaman = 0;
    while (f && pengaman++ < 12) {
      bagian.unshift(f.name);
      f = f.parentId ? cari(f.parentId) : null;
    }
    return bagian.join(' / ');
  }

  /* daftar folder urut tingkatan (untuk <select> tautan tugas) */
  function pilihanBertingkat() {
    var hasil = [];
    (function susun(daftar) {
      daftar.forEach(function (f) {
        hasil.push(f);
        susun(anakDari(f.id));
      });
    })(state.daftar.filter(function (f) { return !f.parentId; }));
    return hasil;
  }

  /* ================= data folder ================= */

  function muat() {
    return DB.semua('folders').then(function (hasil) { state.daftar = hasil; });
  }
  function cari(id) {
    return state.daftar.find(function (f) { return f.id === id; }) || null;
  }
  function daftar() { return state.daftar; }

  /* hapus folder + seluruh subfolder di dalamnya + semua isinya */
  function hapusFolderLengkap(f) {
    var semua = [f].concat(kumpulkanKeturunan(f.id));
    var idHapus = {};
    semua.forEach(function (x) { idHapus[x.id] = true; });
    return semua.reduce(function (janji, x) {
      return janji.then(function () {
        return DB.berdasarkanFolder('items', x.id).then(function (items) {
          return items.reduce(function (j2, it) {
            return j2.then(function () { return DB.hapus('items', it.id); });
          }, Promise.resolve());
        });
      });
    }, Promise.resolve()).then(function () {
      return semua.reduce(function (janji, x) {
        return janji.then(function () { return DB.hapus('folders', x.id); });
      }, Promise.resolve());
    }).then(function () {
      state.daftar = state.daftar.filter(function (x) { return !idHapus[x.id]; });
      /* lepas tautan tugas yang menuju folder yang terhapus */
      var tugasTerkait = Tasks.daftar().filter(function (t) { return t.folderId && idHapus[t.folderId]; });
      return tugasTerkait.reduce(function (janji, t) {
        t.folderId = '';
        return janji.then(function () { return DB.simpan('tasks', t); });
      }, Promise.resolve());
    }).then(function () {
      if (state.aktif && idHapus[state.aktif.id]) return tampilkanBeranda();
      if (state.aktif) return renderDetail();
      return renderBeranda();
    });
  }

  /* ================= render beranda folder ================= */

  function renderBeranda() {
    var wadah = document.getElementById('daftar-folder');
    var kosong = document.getElementById('kosong-folder');
    var akar = state.daftar.filter(function (f) { return !f.parentId; });
    if (!akar.length) {
      wadah.innerHTML = '';
      kosong.hidden = false;
      return Promise.resolve();
    }
    kosong.hidden = true;
    var jumlahTugas = {};
    Tasks.daftar().forEach(function (t) {
      if (t.folderId) jumlahTugas[t.folderId] = (jumlahTugas[t.folderId] || 0) + 1;
    });
    var kartu = [];
    var berurutan = akar.slice().reverse().reduce(function (janji, f) {
      return janji.then(function () {
        return DB.hitungFolder('items', f.id).then(function (n) {
          var nAnak = anakDari(f.id).length;
          var info = [n + ' item'];
          if (nAnak) info.push(nAnak + ' subfolder');
          if (jumlahTugas[f.id]) info.push(jumlahTugas[f.id] + ' tugas terkait');
          kartu.push(
            '<article class="kartu-folder" data-id="' + f.id + '" tabindex="0" role="button" aria-label="Folder ' + esc(f.name) + '">' +
              '<div class="folder-aksi">' +
                '<button type="button" class="icon-btn icon-kecil" data-aksi="ganti-nama" title="Rename folder" aria-label="Rename folder">' + IKON.edit + '</button>' +
                '<button type="button" class="icon-btn icon-kecil" data-aksi="hapus-folder" title="Hapus folder" aria-label="Hapus folder">' + IKON.hapus + '</button>' +
              '</div>' +
              '<span class="ikon-folder" aria-hidden="true">▣</span>' +
              '<h3 class="nama-folder">' + esc(f.name) + '</h3>' +
              '<p class="info-folder">' + info.join(' · ') + '</p>' +
            '</article>');
        });
      });
    }, Promise.resolve());
    return berurutan.then(function () {
      /* folder terbaru di depan */
      wadah.innerHTML = kartu.reverse().join('');
    });
  }

  /* ================= detail folder + galeri ================= */

  function buka(id) {
    var f = cari(id);
    if (!f) { tampilkanBeranda(); return Promise.resolve(); }
    state.aktif = f;
    return DB.berdasarkanFolder('items', id).then(function (items) {
      state.items = items;
      renderDetail();
    });
  }

  function tampilkanBeranda() {
    state.aktif = null;
    state.items = [];
    bersihkanURL();
    Lightbox.tutup();
    document.getElementById('folder-detail').hidden = true;
    document.getElementById('folder-beranda').hidden = false;
    return renderBeranda();
  }

  function tampilkanDetailDiv() {
    document.getElementById('folder-beranda').hidden = true;
    document.getElementById('folder-detail').hidden = false;
  }

  /* remah navigasi: "Semua folder / Induk / Anak" */
  function htmlRemah(f) {
    var rantai = [];
    var x = f;
    var pengaman = 0;
    while (x && pengaman++ < 12) {
      rantai.unshift(x);
      x = x.parentId ? cari(x.parentId) : null;
    }
    var html = '<button type="button" class="remah-item" data-remah="">Semua folder</button>';
    rantai.forEach(function (r, i) {
      html += '<span class="remah-pisah" aria-hidden="true">/</span>';
      if (i === rantai.length - 1) {
        html += '<span class="remah-item remah-ini" aria-current="page">' + esc(r.name) + '</span>';
      } else {
        html += '<button type="button" class="remah-item" data-remah="' + r.id + '">' + esc(r.name) + '</button>';
      }
    });
    return html;
  }

  function fotoFolder() {
    return state.items.filter(function (i) { return i.type === 'foto'; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function renderDetail() {
    var f = state.aktif;
    if (!f) return Promise.resolve();
    tampilkanDetailDiv();
    var nURLLama = kolamURL.length;
    document.getElementById('folder-judul').textContent = f.name;
    document.getElementById('folder-remah').innerHTML = htmlRemah(f);

    var anak = anakDari(f.id);
    var jumlahItemAnak = {};
    var hitungAnak = anak.reduce(function (janji, a) {
      return janji.then(function () {
        return DB.hitungFolder('items', a.id).then(function (n) { jumlahItemAnak[a.id] = n; });
      });
    }, Promise.resolve());

    return hitungAnak.then(function () {
      var fotos = fotoFolder();
      var files = state.items.filter(function (i) { return i.type === 'file'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      var notes = state.items.filter(function (i) { return i.type === 'catatan'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      var tugasTerkait = Tasks.daftar().filter(function (t) { return t.folderId === f.id; });

      var html = '';

      /* subfolder */
      html += '<section class="seksi"><h3>Subfolder <span class="jumlah">' + anak.length + '</span>' +
        '<button type="button" class="btn btn-kecil" data-aksi="tambah-subfolder" title="Buat subfolder di dalam folder ini">' + IKON.tambah + 'Subfolder</button></h3>' +
        (anak.length
          ? '<div class="folder-grid grid-anak">' + anak.map(function (a) {
              var nCucu = anakDari(a.id).length;
              var info = [(jumlahItemAnak[a.id] || 0) + ' item'];
              if (nCucu) info.push(nCucu + ' subfolder');
              return '<article class="kartu-folder kartu-anak" data-id="' + a.id + '" tabindex="0" role="button" aria-label="Subfolder ' + esc(a.name) + '">' +
                '<div class="folder-aksi">' +
                  '<button type="button" class="icon-btn icon-kecil" data-aksi="ganti-nama" title="Rename subfolder" aria-label="Rename subfolder">' + IKON.edit + '</button>' +
                  '<button type="button" class="icon-btn icon-kecil" data-aksi="hapus-folder" title="Hapus subfolder" aria-label="Hapus subfolder">' + IKON.hapus + '</button>' +
                '</div>' +
                '<span class="ikon-folder" aria-hidden="true">▣</span>' +
                '<h4 class="nama-folder">' + esc(a.name) + '</h4>' +
                '<p class="info-folder">' + info.join(' · ') + '</p>' +
              '</article>';
            }).join('') + '</div>'
          : '<p class="teks-kosong-kecil">Belum ada subfolder — mis. satu subfolder per bab atau per topik.</p>') +
        '</section>';

      /* tugas terkait */
      if (tugasTerkait.length) {
        html += '<section class="seksi"><h3>Tugas terkait <span class="jumlah">' + tugasTerkait.length + '</span></h3>' +
          '<div class="daftar-terkait">' +
          tugasTerkait.map(function (t) {
            return '<button type="button" class="baris-terkait" data-aksi="buka-tugas" data-id="' + t.id + '">' +
              '<span class="simbol-status kecil">' + Tasks.simbol(t.status) + '</span>' +
              '<span class="judul-terkait">' + esc(t.title) + '</span>' +
              '<span class="waktu">' + (t.deadline ? esc(Tasks.formatTanggal(t.deadline)) : '') + '</span>' +
              '</button>';
          }).join('') +
          '</div></section>';
      }

      /* foto (bisa diberi catatan) */
      html += '<section class="seksi"><h3>Foto <span class="jumlah">' + fotos.length + '</span></h3>' +
        (fotos.length
          ? '<div class="galeri">' + fotos.map(function (f2, i) {
              return '<figure class="item-galeri" data-idx="' + i + '" role="button" tabindex="0" aria-label="Lihat foto ' + esc(f2.caption || f2.name || 'foto') + '">' +
                '<img src="' + urlObjek(f2.blob) + '" alt="' + esc(f2.caption || f2.name || 'Foto') + '" loading="lazy">' +
                (f2.caption ? '<span class="caption-galeri">' + esc(f2.caption) + '</span>' : '') +
                '<button type="button" class="hapus-galeri" data-aksi="hapus-item" data-id="' + f2.id + '" title="Hapus foto" aria-label="Hapus foto">✕</button>' +
                '</figure>';
            }).join('') + '</div>' +
            '<p class="petunjuk-galeri">Klik foto untuk membesarkan sekaligus memberi catatan.</p>'
          : '<p class="teks-kosong-kecil">Belum ada foto. Tombol <b>Foto</b> mengunggah gambar (dikompres otomatis biar hemat penyimpanan).</p>') +
        '</section>';

      /* file */
      html += '<section class="seksi"><h3>File <span class="jumlah">' + files.length + '</span></h3>' +
        (files.length
          ? '<div class="daftar-file">' + files.map(function (fl) {
              return '<div class="baris-file">' + IKON.file +
                '<span class="nama-file" title="' + esc(fl.name) + '">' + esc(fl.name) + '</span>' +
                '<span class="ukuran-file">' + formatUkuran(fl.size) + '</span>' +
                '<button type="button" class="icon-btn icon-kecil" data-aksi="unduh-item" data-id="' + fl.id + '" title="Unduh file" aria-label="Unduh file">' + IKON.unduh + '</button>' +
                '<button type="button" class="icon-btn icon-kecil" data-aksi="hapus-item" data-id="' + fl.id + '" title="Hapus file" aria-label="Hapus file">' + IKON.hapus + '</button>' +
                '</div>';
            }).join('') + '</div>'
          : '<p class="teks-kosong-kecil">Belum ada file. Tombol <b>File</b> untuk menyimpan PDF, dokumen, dsb.</p>') +
        '</section>';

      /* catatan teks */
      html += '<section class="seksi"><h3>Catatan <span class="jumlah">' + notes.length + '</span></h3>' +
        (notes.length
          ? '<div class="grid-catatan">' + notes.map(function (ct) {
              return '<div class="kartu-catatan">' +
                '<div class="kepala-catatan">' +
                  '<span class="nama-catatan">' + esc(ct.name || 'Catatan') + '</span>' +
                  '<span class="aksi-catatan">' +
                    '<button type="button" class="icon-btn icon-kecil" data-aksi="edit-catatan" data-id="' + ct.id + '" title="Edit catatan" aria-label="Edit catatan">' + IKON.edit + '</button>' +
                    '<button type="button" class="icon-btn icon-kecil" data-aksi="hapus-item" data-id="' + ct.id + '" title="Hapus catatan" aria-label="Hapus catatan">' + IKON.hapus + '</button>' +
                  '</span>' +
                '</div>' +
                '<p class="teks-catatan">' + esc(ct.text) + '</p>' +
                '</div>';
            }).join('') + '</div>'
          : '<p class="teks-kosong-kecil">Belum ada catatan. Tombol <b>Catatan</b> untuk menulis catatan teks.</p>') +
        '</section>';

      document.getElementById('folder-isi').innerHTML = html;
      /* revoke object URL lama SETELAH DOM baru terpasang (agar tidak kedip) */
      kolamURL.splice(0, nURLLama).forEach(function (u) { URL.revokeObjectURL(u); });
    });
  }

  /* ================= tambah isi folder ================= */

  function tambahDariBerkas(daftarBerkas) {
    if (!state.aktif || !daftarBerkas.length) return Promise.resolve();
    if (daftarBerkas.length > 1) toast('Memproses ' + daftarBerkas.length + ' berkas…');
    else toast('Memproses berkas…');
    var nFoto = 0, nFile = 0;
    var berurutan = daftarBerkas.reduce(function (janji, b) {
      return janji.then(function () {
        return kompresFoto(b).then(function (hasil) {
          var jenis = (b.type && b.type.indexOf('image/') === 0) ? 'foto' : 'file';
          var nama = b.name || (jenis === 'foto' ? 'foto.jpg' : 'berkas');
          if (hasil.berubah) nama = nama.replace(/\.[^.]+$/, '') + '.jpg';
          var item = {
            id: uid(),
            folderId: state.aktif.id,
            taskId: '',
            type: jenis,
            name: nama,
            mime: hasil.blob.type || b.type || '',
            size: hasil.blob.size,
            blob: hasil.blob,
            text: '',
            caption: '',
            createdAt: Date.now()
          };
          if (jenis === 'foto') nFoto++; else nFile++;
          state.items.push(item);
          return DB.simpan('items', item);
        });
      });
    }, Promise.resolve());
    return berurutan.then(function () {
      renderDetail();
      var bagian = [];
      if (nFoto) bagian.push(nFoto + ' foto');
      if (nFile) bagian.push(nFile + ' file');
      toast(bagian.join(' dan ') + ' ditambahkan.');
    }).catch(function (e) {
      renderDetail();
      toast('Gagal mengunggah: ' + (e && e.message ? e.message : e));
    });
  }

  /* ================= catatan teks ================= */

  function bukaModalCatatan(item) {
    if (!state.aktif) return;
    formCatatan.dataset.id = item ? item.id : '';
    document.getElementById('cat-judul').textContent = item ? 'Edit Catatan' : 'Catatan Baru';
    document.getElementById('c-nama').value = item ? (item.name || '') : '';
    document.getElementById('c-isi').value = item ? item.text : '';
    bukaModal(document.getElementById('modal-catatan'));
    setTimeout(function () { document.getElementById('c-isi').focus(); }, 60);
  }

  function kirimCatatan(e) {
    e.preventDefault();
    var isi = document.getElementById('c-isi').value.trim();
    if (!isi) {
      toast('Isi catatan tidak boleh kosong.');
      document.getElementById('c-isi').focus();
      return;
    }
    var nama = document.getElementById('c-nama').value.trim();
    var id = formCatatan.dataset.id;
    var item = id ? state.items.find(function (i) { return i.id === id; }) : null;
    var janji;
    if (item) {
      item.name = nama;
      item.text = isi;
      janji = DB.simpan('items', item);
    } else {
      item = {
        id: uid(),
        folderId: state.aktif.id,
        taskId: '',
        type: 'catatan',
        name: nama,
        mime: '',
        size: 0,
        blob: null,
        text: isi,
        caption: '',
        createdAt: Date.now()
      };
      state.items.push(item);
      janji = DB.simpan('items', item);
    }
    janji.then(function () {
      tutupModal(document.getElementById('modal-catatan'));
      renderDetail();
      toast('Catatan disimpan.');
    }).catch(function (e) { toast('Gagal menyimpan catatan.'); });
  }

  /* ================= hapus / unduh item ================= */

  function konfirmasiHapusItem(id) {
    var it = state.items.find(function (i) { return i.id === id; });
    if (!it) return Promise.resolve();
    var jenis = it.type === 'foto' ? 'foto' : it.type === 'file' ? 'file' : 'catatan';
    var nama = it.type === 'catatan' ? (it.name || 'catatan tanpa judul') : (it.name || jenis);
    return konfirmasi({
      judul: 'Hapus ' + jenis + '?',
      pesan: '“' + nama + '” akan dihapus permanen dari folder ini.',
      ya: 'Hapus'
    }).then(function (ok) {
      if (!ok) return;
      return DB.hapus('items', id).then(function () {
        state.items = state.items.filter(function (i) { return i.id !== id; });
        renderDetail();
        toast('Dihapus.');
      });
    });
  }

  function unduhItem(id) {
    var it = state.items.find(function (i) { return i.id === id; });
    if (!it || !it.blob) return;
    var a = document.createElement('a');
    var u = URL.createObjectURL(it.blob);
    a.href = u;
    a.download = it.name || 'berkas';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 8000);
  }

  /* ================= form folder (baru / subfolder / rename) ================= */

  function bukaFormFolder(f, idInduk) {
    formFolder.dataset.id = f ? f.id : '';
    formFolder.dataset.induk = (!f && idInduk) ? idInduk : '';
    var info = document.getElementById('ff-info');
    if (!f && idInduk) {
      document.getElementById('folder-form-judul').textContent = 'Subfolder Baru';
      info.textContent = 'Akan dibuat di dalam: ' + jalurNama(idInduk);
      info.hidden = false;
    } else {
      document.getElementById('folder-form-judul').textContent = f ? 'Rename Folder' : 'Folder Baru';
      info.hidden = true;
    }
    document.getElementById('ff-nama').value = f ? f.name : '';
    bukaModal(document.getElementById('modal-folder'));
    setTimeout(function () { document.getElementById('ff-nama').focus(); }, 60);
  }

  function kirimFolder(e) {
    e.preventDefault();
    var nama = document.getElementById('ff-nama').value.trim();
    if (!nama) {
      toast('Nama folder wajib diisi.');
      document.getElementById('ff-nama').focus();
      return;
    }
    var id = formFolder.dataset.id;
    var f = id ? cari(id) : null;
    if (f) f.name = nama;
    else f = { id: uid(), name: nama, parentId: formFolder.dataset.induk || '', createdAt: Date.now() };
    DB.simpan('folders', f).then(function () {
      if (!cari(f.id)) state.daftar.push(f);
      tutupModal(document.getElementById('modal-folder'));
      toast(f.parentId ? 'Subfolder disimpan.' : 'Folder disimpan.');
      if (state.aktif) {
        if (state.aktif.id === f.id) state.aktif = f;
        renderDetail();
      } else {
        renderBeranda();
      }
    }).catch(function () { toast('Gagal menyimpan folder.'); });
  }

  function konfirmasiHapusFolder(id) {
    var f = cari(id);
    if (!f) return Promise.resolve();
    var keturunan = kumpulkanKeturunan(id);
    var semua = [f].concat(keturunan);
    var totalItem = 0;
    var hitung = semua.reduce(function (janji, x) {
      return janji.then(function () {
        return DB.hitungFolder('items', x.id).then(function (n) { totalItem += n; });
      });
    }, Promise.resolve());
    return hitung.then(function () {
      var pesan = 'Folder “' + f.name + '”' +
        (keturunan.length ? ' beserta ' + keturunan.length + ' subfolder di dalamnya' : '') +
        ' dan seluruh isinya (' + totalItem + ' item) akan dihapus permanen. Tugas yang tertaut tidak ikut terhapus.';
      return konfirmasi({
        judul: 'Hapus folder?',
        pesan: pesan,
        ya: 'Hapus'
      }).then(function (ok) {
        if (!ok) return;
        return hapusFolderLengkap(f).then(function () {
          App.segar();
          toast('Folder dihapus.');
        });
      });
    });
  }

  /* ================= event ================= */

  function pasangEvent() {
    Lightbox.pasangEvent();

    /* kartu folder root: klik tombol aksi vs klik kartu */
    document.getElementById('daftar-folder').addEventListener('click', function (e) {
      var kartu = e.target.closest ? e.target.closest('.kartu-folder') : null;
      if (!kartu) return;
      var tombolAksi = e.target.closest('[data-aksi]');
      if (tombolAksi) {
        var aksi = tombolAksi.dataset.aksi;
        if (aksi === 'ganti-nama') { bukaFormFolder(cari(kartu.dataset.id)); return; }
        if (aksi === 'hapus-folder') { konfirmasiHapusFolder(kartu.dataset.id); return; }
      }
      buka(kartu.dataset.id);
    });
    document.getElementById('daftar-folder').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.classList && e.target.classList.contains('kartu-folder')) {
        e.preventDefault();
        buka(e.target.dataset.id);
      }
    });

    /* remah: lompat ke folder induk / kembali ke beranda */
    document.getElementById('folder-remah').addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-remah]') : null;
      if (!t) return;
      if (t.dataset.remah) buka(t.dataset.remah);
      else tampilkanBeranda();
    });

    /* isi folder: subfolder, galeri, file, catatan, tugas terkait */
    var folderIsi = document.getElementById('folder-isi');
    folderIsi.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-aksi]') : null;
      if (el) {
        var aksi = el.dataset.aksi;
        if (aksi === 'hapus-item') { konfirmasiHapusItem(el.dataset.id); return; }
        if (aksi === 'unduh-item') { unduhItem(el.dataset.id); return; }
        if (aksi === 'edit-catatan') {
          bukaModalCatatan(state.items.find(function (i) { return i.id === el.dataset.id; }));
          return;
        }
        if (aksi === 'buka-tugas') { Tasks.bukaDetail(el.dataset.id); return; }
        if (aksi === 'tambah-subfolder') { if (state.aktif) bukaFormFolder(null, state.aktif.id); return; }
        if (aksi === 'ganti-nama') {
          var kartuNama = el.closest('.kartu-folder');
          if (kartuNama) bukaFormFolder(cari(kartuNama.dataset.id));
          return;
        }
        if (aksi === 'hapus-folder') {
          var kartuHapus = el.closest('.kartu-folder');
          if (kartuHapus) konfirmasiHapusFolder(kartuHapus.dataset.id);
          return;
        }
      }
      var fig = e.target.closest ? e.target.closest('.item-galeri') : null;
      if (fig) { Lightbox.buka(fotoFolder(), Number(fig.dataset.idx), renderDetail); return; }
      var kartu = e.target.closest ? e.target.closest('.kartu-folder') : null;
      if (kartu) buka(kartu.dataset.id);
    });
    folderIsi.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var fig = e.target.closest ? e.target.closest('.item-galeri') : null;
      if (fig && e.target === fig) {
        e.preventDefault();
        Lightbox.buka(fotoFolder(), Number(fig.dataset.idx), renderDetail);
        return;
      }
      var kartu = e.target.closest ? e.target.closest('.kartu-folder') : null;
      if (kartu && e.target === kartu) {
        e.preventDefault();
        buka(kartu.dataset.id);
      }
    });

    /* tombol statis di area folder */
    document.getElementById('btn-tambah-folder').addEventListener('click', function () { bukaFormFolder(null); });
    document.getElementById('btn-rename-folder').addEventListener('click', function () {
      if (state.aktif) bukaFormFolder(state.aktif);
    });
    document.getElementById('btn-hapus-folder').addEventListener('click', function () {
      if (state.aktif) konfirmasiHapusFolder(state.aktif.id);
    });
    document.getElementById('btn-tambah-foto').addEventListener('click', function () {
      document.getElementById('berkas-foto').click();
    });
    document.getElementById('btn-tambah-file').addEventListener('click', function () {
      document.getElementById('berkas-file').click();
    });
    document.getElementById('btn-tambah-catatan').addEventListener('click', function () { bukaModalCatatan(null); });
    document.getElementById('berkas-foto').addEventListener('change', function (e) {
      tambahDariBerkas(Array.prototype.slice.call(e.target.files || []));
      e.target.value = '';
    });
    document.getElementById('berkas-file').addEventListener('change', function (e) {
      tambahDariBerkas(Array.prototype.slice.call(e.target.files || []));
      e.target.value = '';
    });

    /* form */
    formFolder.addEventListener('submit', kirimFolder);
    formCatatan.addEventListener('submit', kirimCatatan);
  }

  /* ================= API global ================= */

  window.Folders = {
    muat: muat,
    cari: cari,
    daftar: daftar,
    buka: buka,
    renderBeranda: renderBeranda,
    tampilkanBeranda: tampilkanBeranda,
    pasangEvent: pasangEvent,
    jalurNama: jalurNama,
    pilihanBertingkat: pilihanBertingkat,
    segarkan: function () {
      if (state.aktif) return buka(state.aktif.id);
      return renderBeranda();
    }
  };
})();
