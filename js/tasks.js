/* ============================================================
   tasks.js — Logika tugas: tambah/edit/hapus, ubah status,
   checklist sub-tugas + progress otomatis, urut otomatis
   berdasarkan deadline, penanda telat, filter & pencarian,
   render daftar tugas, panel detail, dan foto milik tugas
   (unggah / lihat / beri catatan / hapus).
   ============================================================ */
(function () {
  'use strict';

  var NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var KATEGORI_AWAL = ['PR', 'UKK', 'TKA', 'PKL', 'Tugas', 'Ujian', 'Proyek', 'Lainnya'];
  var SIMBOL_STATUS = { belum: '○', proses: '◐', selesai: '●' };
  var LABEL_STATUS = { belum: 'Belum', proses: 'Proses', selesai: 'Selesai' };
  var TANDA_PRIORITAS = { 1: '!', 2: '!!', 3: '!!!' };
  var LABEL_PRIORITAS = { 1: 'Rendah', 2: 'Sedang', 3: 'Tinggi' };
  var URUTAN_STATUS = ['belum', 'proses', 'selesai'];

  var state = { daftar: [], fotoTugas: [], filter: { q: '', status: 'semua', kategori: 'semua' } };
  var detailAktif = null;   /* id tugas yang sedang dibuka di panel detail */
  var editDariDetail = false;

  var formTugas = document.getElementById('form-tugas');

  var kolamURLTugas = [];   /* object URL foto tugas agar bisa direvoke */

  function urlTugas(blob) {
    var u = URL.createObjectURL(blob);
    kolamURLTugas.push(u);
    return u;
  }
  function bersihkanURLTugas() {
    while (kolamURLTugas.length) URL.revokeObjectURL(kolamURLTugas.pop());
  }

  /* ikon tombol unggah foto di panel detail */
  var IKON_FOTO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.7"/><path d="m6 17 3.5-3.5 3 3 2.5-2.5 4 4"/></svg>';

  /* ================= util ================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  window.esc = esc;

  function selisihHari(iso) {
    var p = iso.split('-').map(Number);
    var jatuhTempo = new Date(p[0], p[1] - 1, p[2]);
    var kini = new Date();
    kini.setHours(0, 0, 0, 0);
    return Math.round((jatuhTempo - kini) / 86400000);
  }

  function formatTanggal(iso) {
    if (!iso) return '';
    var p = iso.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    var hasil = NAMA_HARI[dt.getDay()] + ', ' + p[2] + ' ' + NAMA_BULAN[p[1] - 1];
    if (p[0] !== new Date().getFullYear()) hasil += ' ' + p[0];
    return hasil;
  }

  function isTelat(t) {
    return !!t.deadline && t.status !== 'selesai' && selisihHari(t.deadline) < 0;
  }

  /* label waktu sisa: "3 hari lagi", "besok", "hari ini", "telat 2 hari" */
  function labelWaktu(t) {
    if (!t.deadline) return 'tanpa deadline';
    if (t.status === 'selesai') return 'selesai';
    var n = selisihHari(t.deadline);
    if (n < 0) return 'telat ' + Math.abs(n) + ' hari';
    if (n === 0) return 'hari ini';
    if (n === 1) return 'besok';
    return n + ' hari lagi';
  }

  function progres(t) {
    if (!t.checklist || !t.checklist.length) return null;
    var selesai = t.checklist.filter(function (c) { return c.done; }).length;
    return { selesai: selesai, total: t.checklist.length, persen: Math.round(selesai / t.checklist.length * 100) };
  }

  function namaFolder(id) {
    if (!id || !window.Folders || !Folders.jalurNama) return '';
    /* tampilkan jalur lengkap: "Induk / Anak" */
    return Folders.jalurNama(id);
  }

  /* ================= data ================= */

  function muat() {
    return DB.semua('tasks').then(function (hasil) { state.daftar = hasil; });
  }

  function cari(id) {
    return state.daftar.find(function (t) { return t.id === id; }) || null;
  }

  function tugasBaru() {
    return {
      id: uid(),
      title: '',
      mapel: '',
      kategori: '',
      deadline: '',
      prioritas: 2,
      status: 'belum',
      catatan: '',
      checklist: [],
      folderId: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function simpan(t) {
    t.updatedAt = Date.now();
    return DB.simpan('tasks', t).then(function () {
      if (!cari(t.id)) state.daftar.push(t);
      return t;
    });
  }

  function hapus(id) {
    /* hapus juga foto-foto milik tugas ini */
    return DB.berdasarkanTugas('items', id).then(function (fotos) {
      return fotos.reduce(function (janji, f) {
        return janji.then(function () { return DB.hapus('items', f.id); });
      }, Promise.resolve());
    }).then(function () {
      return DB.hapus('tasks', id);
    }).then(function () {
      state.daftar = state.daftar.filter(function (t) { return t.id !== id; });
    });
  }

  /* ================= urut & filter ================= */

  /* Aktif dulu (belum/proses) urut deadline naik; selesai di bawah. */
  function urutkan(arr) {
    return arr.slice().sort(function (a, b) {
      var ga = a.status === 'selesai' ? 1 : 0;
      var gb = b.status === 'selesai' ? 1 : 0;
      if (ga !== gb) return ga - gb;
      var da = a.deadline || '9999-12-31';
      var db = b.deadline || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      if (a.prioritas !== b.prioritas) return b.prioritas - a.prioritas;
      return b.updatedAt - a.updatedAt;
    });
  }

  function hasilFilter() {
    var q = state.filter.q.trim().toLowerCase();
    return state.daftar.filter(function (t) {
      if (state.filter.status === 'aktif' && t.status === 'selesai') return false;
      if (state.filter.status !== 'semua' && state.filter.status !== 'aktif' &&
          t.status !== state.filter.status) return false;
      if (state.filter.kategori !== 'semua' && (t.kategori || '') !== state.filter.kategori) return false;
      if (q) {
        var teks = (t.title + ' ' + t.mapel + ' ' + t.kategori + ' ' + t.catatan + ' ' +
          (t.checklist || []).map(function (c) { return c.text; }).join(' ')).toLowerCase();
        if (teks.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* ================= render daftar ================= */

  function isiFilterKategori() {
    var sel = document.getElementById('filter-kategori');
    var dipakai = [];
    state.daftar.forEach(function (t) {
      if (t.kategori && dipakai.indexOf(t.kategori) === -1) dipakai.push(t.kategori);
    });
    KATEGORI_AWAL.forEach(function (k) {
      if (dipakai.indexOf(k) === -1) dipakai.push(k);
    });
    dipakai.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    var pilihan = ['<option value="semua">Semua kategori</option>'].concat(dipakai.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + '</option>';
    }));
    var sebelumnya = state.filter.kategori;
    sel.innerHTML = pilihan.join('');
    if (sebelumnya !== 'semua' && dipakai.indexOf(sebelumnya) === -1) state.filter.kategori = 'semua';
    sel.value = state.filter.kategori;
  }

  function kartuTugas(t) {
    var p = progres(t);
    var telat = isTelat(t);
    var folder = t.folderId ? namaFolder(t.folderId) : '';
    var meta = [];
    if (t.mapel) meta.push('<span>' + esc(t.mapel) + '</span>');
    if (t.kategori) meta.push('<span class="chip">' + esc(t.kategori) + '</span>');
    if (folder) meta.push('<span class="tanda-folder" title="Tertaut ke folder">▣ ' + esc(folder) + '</span>');
    meta.push('<span class="waktu' + (telat ? ' waktu-telat' : '') + '">' +
      (t.deadline ? esc(formatTanggal(t.deadline)) + ' · ' + esc(labelWaktu(t)) : 'tanpa deadline') + '</span>');

    return '' +
      '<article class="kartu-tugas ' + t.status + '" data-id="' + t.id + '" tabindex="0" role="button" aria-label="' + esc(t.title) + '">' +
        '<button type="button" class="simbol-status" data-aksi="status" title="Ubah status (sekarang: ' + esc(LABEL_STATUS[t.status]) + ')">' + SIMBOL_STATUS[t.status] + '</button>' +
        '<div class="badan-tugas">' +
          '<div class="atas-tugas">' +
            '<h3 class="judul-tugas">' + esc(t.title) + '</h3>' +
            (t.prioritas ? '<span class="prioritas p' + t.prioritas + '" title="Prioritas ' + esc(LABEL_PRIORITAS[t.prioritas]) + '">' + TANDA_PRIORITAS[t.prioritas] + '</span>' : '') +
            (telat ? '<span class="lencana-telat">Telat</span>' : '') +
          '</div>' +
          (meta.length ? '<div class="meta-tugas">' + meta.join('<span class="titik-meta">·</span>') + '</div>' : '') +
          (p ? '<div class="progress"><div class="isi-progress" style="width:' + p.persen + '%"></div></div>' +
              '<div class="teks-progress">' + p.selesai + '/' + p.total + ' sub-tugas' + (p.persen === 100 ? ' · lengkap' : '') + '</div>' : '') +
        '</div>' +
        '<span class="panah" aria-hidden="true">›</span>' +
      '</article>';
  }

  function render() {
    isiFilterKategori();
    var wadah = document.getElementById('daftar-tugas');
    var kosong = document.getElementById('kosong-tugas');
    var hasil = urutkan(hasilFilter());
    if (!hasil.length) {
      wadah.innerHTML = '';
      kosong.hidden = false;
      var adaData = state.daftar.length > 0;
      kosong.querySelector('.judul-kosong').textContent = adaData ? 'Tidak ada yang cocok' : 'Belum ada tugas';
      kosong.querySelector('.teks-kosong').innerHTML = adaData
        ? 'Coba ubah kata kunci pencarian atau filternya.'
        : 'Klik tombol <b>+ Tugas</b> untuk mencatat kerjaan pertamamu.';
      return;
    }
    kosong.hidden = true;
    wadah.innerHTML = hasil.map(kartuTugas).join('');
  }

  /* ================= form tugas ================= */

  function bukaForm(id, dariDetail) {
    editDariDetail = !!dariDetail;
    var t = id ? cari(id) : tugasBaru();
    if (!t) return;
    formTugas.dataset.id = id || '';
    document.getElementById('judul-form').textContent = id ? 'Edit Tugas' : 'Tambah Tugas';
    document.getElementById('f-judul').value = t.title;
    document.getElementById('f-mapel').value = t.mapel || '';
    document.getElementById('f-kategori').value = t.kategori || '';
    document.getElementById('f-deadline').value = t.deadline || '';
    document.getElementById('f-catatan').value = t.catatan || '';
    var radio = document.querySelector('input[name="prioritas"][value="' + (t.prioritas || 2) + '"]');
    if (radio) radio.checked = true;

    /* isi pilihan folder (selalu segar, dengan jalur bertingkat) */
    var sel = document.getElementById('f-folder');
    var pohon = (window.Folders && Folders.pilihanBertingkat) ? Folders.pilihanBertingkat() : [];
    var opsi = ['<option value="">— tanpa folder —</option>'].concat(pohon.map(function (f) {
      return '<option value="' + f.id + '"' + (t.folderId === f.id ? ' selected' : '') + '>' +
        esc(Folders.jalurNama(f.id)) + '</option>';
    }));
    sel.innerHTML = opsi.join('');

    bukaModal(document.getElementById('modal-tugas'));
    setTimeout(function () { document.getElementById('f-judul').focus(); }, 60);
  }

  function kirimForm(e) {
    e.preventDefault();
    var judul = document.getElementById('f-judul').value.trim();
    if (!judul) {
      toast('Judul tugas wajib diisi.');
      document.getElementById('f-judul').focus();
      return;
    }
    var id = formTugas.dataset.id;
    var t = id ? cari(id) : tugasBaru();
    if (!t) return;
    t.title = judul;
    t.mapel = document.getElementById('f-mapel').value.trim();
    t.kategori = document.getElementById('f-kategori').value.trim();
    t.deadline = document.getElementById('f-deadline').value || '';
    var cek = document.querySelector('input[name="prioritas"]:checked');
    t.prioritas = cek ? Number(cek.value) : 2;
    t.catatan = document.getElementById('f-catatan').value.trim();
    t.folderId = document.getElementById('f-folder').value || '';
    simpan(t).then(function () {
      tutupModal(document.getElementById('modal-tugas'));
      App.segar();
      toast(id ? 'Tugas diperbarui.' : 'Tugas ditambahkan.');
      if (editDariDetail) bukaDetail(t.id);
    }).catch(function (e) { toast('Gagal menyimpan: ' + (e && e.message)); });
  }

  /* ================= status ================= */

  function ubahStatus(id, status) {
    var t = cari(id);
    if (!t || !SIMBOL_STATUS[status]) return Promise.resolve();
    t.status = status;
    return simpan(t).then(function () {
      App.segar();
      if (detailAktif === id) renderDetail();
    });
  }

  function putarStatus(id) {
    var t = cari(id);
    if (!t) return Promise.resolve();
    var i = URUTAN_STATUS.indexOf(t.status);
    return ubahStatus(id, URUTAN_STATUS[(i + 1) % 3]);
  }

  /* ================= panel detail ================= */

  function bukaDetail(id) {
    if (!cari(id)) return;
    detailAktif = id;
    /* muat foto milik tugas ini sebelum menampilkan panel */
    DB.berdasarkanTugas('items', id).then(function (hasil) {
      state.fotoTugas = hasil.filter(function (i) { return i.type === 'foto'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      renderDetail();
      bukaModal(document.getElementById('modal-detail'));
    }).catch(function () {
      state.fotoTugas = [];
      renderDetail();
      bukaModal(document.getElementById('modal-detail'));
    });
  }

  function tutupDetail() {
    detailAktif = null;
    state.fotoTugas = [];
    bersihkanURLTugas();
    tutupModal(document.getElementById('modal-detail'));
  }

  function detailDitutup() {
    detailAktif = null;
    state.fotoTugas = [];
    bersihkanURLTugas();
  }

  function barisMeta(label, isiHtml) {
    return '<div><dt>' + label + '</dt><dd>' + (isiHtml || '—') + '</dd></div>';
  }

  function itemChecklist(c) {
    return '<li class="item-check' + (c.done ? ' selesai' : '') + '" data-id="' + c.id + '">' +
      '<button type="button" class="kotak-ceklis" data-aksi="ceklis" aria-label="' + (c.done ? 'Batalkan' : 'Tandai selesai') + '" title="' + (c.done ? 'Batalkan' : 'Tandai selesai') + '">' + (c.done ? '✓' : '') + '</button>' +
      '<span class="teks-item">' + esc(c.text) + '</span>' +
      '<button type="button" class="hapus-item" data-aksi="hapus-check" title="Hapus sub-tugas" aria-label="Hapus sub-tugas">✕</button>' +
      '</li>';
  }

  function renderDetail() {
    bersihkanURLTugas();
    var t = detailAktif ? cari(detailAktif) : null;
    document.getElementById('d-judul').textContent = t ? t.title : '';
    var wadah = document.getElementById('d-isi');
    if (!t) { wadah.innerHTML = ''; return; }

    var p = progres(t);
    var telat = isTelat(t);
    var folder = t.folderId ? namaFolder(t.folderId) : '';
    var pohon = (window.Folders && Folders.pilihanBertingkat) ? Folders.pilihanBertingkat() : [];
    var fotos = state.fotoTugas;

    var html = '' +
    '<div class="segmen-status" role="group" aria-label="Status tugas">' +
      URUTAN_STATUS.map(function (s) {
        return '<button type="button" class="status-btn' + (t.status === s ? ' aktif' : '') +
          '" data-aksi="set-status" data-status="' + s + '">' + SIMBOL_STATUS[s] + ' ' + LABEL_STATUS[s] + '</button>';
      }).join('') +
    '</div>' +

    '<dl class="kisi-meta">' +
      barisMeta('Mapel', t.mapel ? esc(t.mapel) : '') +
      barisMeta('Kategori', t.kategori ? '<span class="chip">' + esc(t.kategori) + '</span>' : '') +
      barisMeta('Deadline', t.deadline
        ? esc(formatTanggal(t.deadline)) + ' <span class="teks-waktu">(' + esc(labelWaktu(t)) + ')</span>' + (telat ? ' <span class="lencana-telat">Telat</span>' : '')
        : '—') +
      barisMeta('Prioritas', t.prioritas ? esc(TANDA_PRIORITAS[t.prioritas]) + ' ' + esc(LABEL_PRIORITAS[t.prioritas]) : '—') +
    '</dl>' +

    '<section class="seksi">' +
      '<h3>Checklist' + (p ? ' <span class="jumlah">' + p.selesai + '/' + p.total + '</span>' : '') + '</h3>' +
      (p ? '<div class="progress"><div class="isi-progress" style="width:' + p.persen + '%"></div></div>' : '') +
      (t.checklist && t.checklist.length
        ? '<ul class="checklist">' + t.checklist.map(itemChecklist).join('') + '</ul>'
        : '<p class="teks-kosong-kecil">Belum ada sub-tugas. Pecah tugas jadi langkah kecil biar gampang dikerjain.</p>') +
      '<form class="tambah-check" id="d-tambah-check">' +
        '<input type="text" id="d-input-check" placeholder="Tambah sub-tugas…" maxlength="200" autocomplete="off">' +
        '<button type="submit" class="btn btn-kecil">Tambah</button>' +
      '</form>' +
    '</section>' +

    '<section class="seksi">' +
      '<h3>Foto <span class="jumlah">' + fotos.length + '</span>' +
        '<button type="button" class="btn btn-kecil" data-aksi="unggah-foto-tugas" title="Unggah foto untuk tugas ini">' + IKON_FOTO + 'Unggah</button></h3>' +
      (fotos.length
        ? '<div class="galeri">' + fotos.map(function (f2, i) {
            return '<figure class="item-galeri" data-idx="' + i + '" role="button" tabindex="0" aria-label="Lihat foto ' + esc(f2.caption || f2.name || 'foto') + '">' +
              '<img src="' + urlTugas(f2.blob) + '" alt="' + esc(f2.caption || f2.name || 'Foto') + '" loading="lazy">' +
              (f2.caption ? '<span class="caption-galeri">' + esc(f2.caption) + '</span>' : '') +
              '<button type="button" class="hapus-galeri" data-aksi="hapus-foto-tugas" data-id="' + f2.id + '" title="Hapus foto" aria-label="Hapus foto">✕</button>' +
              '</figure>';
          }).join('') + '</div>' +
          '<p class="petunjuk-galeri">Klik foto untuk membesarkan sekaligus memberi catatan.</p>'
        : '<p class="teks-kosong-kecil">Belum ada foto untuk tugas ini — mis. foto soal, papan tulis, atau hasil kerja. Foto dikompres otomatis.</p>') +
    '</section>' +

    '<section class="seksi">' +
      '<h3>Catatan</h3>' +
      (t.catatan ? '<p class="teks-catatan">' + esc(t.catatan) + '</p>' : '<p class="teks-kosong-kecil">Belum ada catatan.</p>') +
    '</section>' +

    '<section class="seksi">' +
      '<h3>Folder</h3>' +
      (folder
        ? '<div class="tautan-folder-box"><span class="nama-folder">▣ ' + esc(folder) + '</span>' +
            '<button type="button" class="btn btn-kecil" data-aksi="buka-folder" data-id="' + t.folderId + '">Buka folder</button></div>'
        : '<select class="pilih-folder" data-aksi="pilih-folder" aria-label="Tautkan tugas ke folder">' +
            '<option value="">— tautkan ke folder… —</option>' +
            pohon.map(function (f) {
              return '<option value="' + f.id + '">' + esc(Folders.jalurNama(f.id)) + '</option>';
            }).join('') +
          '</select>') +
    '</section>' +

    '<div class="aksi-detail">' +
      '<button type="button" class="btn" data-aksi="edit">Edit</button>' +
      '<button type="button" class="btn btn-bahaya" data-aksi="hapus">Hapus</button>' +
    '</div>';

    wadah.innerHTML = html;
  }

  /* ================= checklist ================= */

  function tambahChecklist(teks) {
    var t = detailAktif ? cari(detailAktif) : null;
    if (!t || !teks) return Promise.resolve();
    t.checklist = t.checklist || [];
    t.checklist.push({ id: uid(), text: teks, done: false });
    return simpan(t).then(function () {
      App.segar();
      renderDetail();
    });
  }

  function putarChecklist(cid) {
    var t = detailAktif ? cari(detailAktif) : null;
    if (!t) return Promise.resolve();
    var c = (t.checklist || []).find(function (x) { return x.id === cid; });
    if (!c) return Promise.resolve();
    c.done = !c.done;
    return simpan(t).then(function () {
      App.segar();
      renderDetail();
    });
  }

  function hapusChecklist(cid) {
    var t = detailAktif ? cari(detailAktif) : null;
    if (!t) return Promise.resolve();
    t.checklist = (t.checklist || []).filter(function (x) { return x.id !== cid; });
    return simpan(t).then(function () {
      App.segar();
      renderDetail();
    });
  }

  /* ================= foto tugas ================= */

  function tambahFotoTugas(daftarBerkas) {
    var t = detailAktif ? cari(detailAktif) : null;
    if (!t || !daftarBerkas.length) return Promise.resolve();
    toast(daftarBerkas.length > 1 ? 'Memproses ' + daftarBerkas.length + ' foto…' : 'Memproses foto…');
    return daftarBerkas.reduce(function (janji, b) {
      return janji.then(function () {
        return window.kompresFoto(b).then(function (hasil) {
          var nama = b.name || 'foto.jpg';
          if (hasil.berubah) nama = nama.replace(/\.[^.]+$/, '') + '.jpg';
          var item = {
            id: uid(),
            folderId: '',
            taskId: t.id,
            type: 'foto',
            name: nama,
            mime: hasil.blob.type || b.type || '',
            size: hasil.blob.size,
            blob: hasil.blob,
            text: '',
            caption: '',
            createdAt: Date.now()
          };
          state.fotoTugas.push(item);
          return DB.simpan('items', item);
        });
      });
    }, Promise.resolve()).then(function () {
      renderDetail();
      toast(daftarBerkas.length + ' foto ditambahkan ke tugas.');
    }).catch(function (e) {
      renderDetail();
      toast('Gagal mengunggah foto: ' + (e && e.message ? e.message : e));
    });
  }

  function konfirmasiHapusFotoTugas(id) {
    var it = state.fotoTugas.find(function (f) { return f.id === id; });
    if (!it) return Promise.resolve();
    var nama = it.caption || it.name || 'foto';
    return konfirmasi({
      judul: 'Hapus foto?',
      pesan: 'Foto “' + nama + '” beserta catatannya akan dihapus permanen dari tugas ini.',
      ya: 'Hapus'
    }).then(function (ok) {
      if (!ok) return;
      return DB.hapus('items', id).then(function () {
        state.fotoTugas = state.fotoTugas.filter(function (f) { return f.id !== id; });
        renderDetail();
        toast('Foto dihapus.');
      });
    });
  }

  /* ================= tautan folder ================= */

  function tautkanFolder(tid, fid) {
    var t = cari(tid);
    if (!t) return Promise.resolve();
    t.folderId = fid || '';
    return simpan(t).then(function () {
      App.segar();
      renderDetail();
      if (fid) toast('Tugas ditautkan ke folder.');
    });
  }

  /* ================= hapus tugas ================= */

  function konfirmasiHapus(id) {
    var t = cari(id);
    if (!t) return Promise.resolve();
    return konfirmasi({
      judul: 'Hapus tugas?',
      pesan: '“' + t.title + '” beserta checklist, catatan, dan foto-fotonya akan dihapus permanen.',
      ya: 'Hapus'
    }).then(function (ok) {
      if (!ok) return;
      tutupDetail();
      return hapus(id).then(function () {
        App.segar();
        toast('Tugas dihapus.');
      });
    });
  }

  /* ================= event ================= */

  function pasangEvent() {
    /* daftar tugas: klik simbol = putar status, klik kartu = buka detail */
    document.getElementById('daftar-tugas').addEventListener('click', function (e) {
      var kartu = e.target.closest ? e.target.closest('.kartu-tugas') : null;
      if (!kartu) return;
      if (e.target.closest('.simbol-status')) { putarStatus(kartu.dataset.id); return; }
      bukaDetail(kartu.dataset.id);
    });
    document.getElementById('daftar-tugas').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.classList && e.target.classList.contains('kartu-tugas')) {
        e.preventDefault();
        bukaDetail(e.target.dataset.id);
      }
    });

    /* isi panel detail: delegasi klik + submit + change */
    var dIsi = document.getElementById('d-isi');
    dIsi.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-aksi]') : null;
      if (el && detailAktif) {
        var aksi = el.dataset.aksi;
        if (aksi === 'set-status') ubahStatus(detailAktif, el.dataset.status);
        else if (aksi === 'ceklis') putarChecklist(el.closest('.item-check').dataset.id);
        else if (aksi === 'hapus-check') hapusChecklist(el.closest('.item-check').dataset.id);
        else if (aksi === 'edit') bukaForm(detailAktif, true);
        else if (aksi === 'hapus') konfirmasiHapus(detailAktif);
        else if (aksi === 'unggah-foto-tugas') document.getElementById('berkas-foto-tugas').click();
        else if (aksi === 'hapus-foto-tugas') konfirmasiHapusFotoTugas(el.dataset.id);
        else if (aksi === 'buka-folder') {
          tutupDetail();
          App.bukaFolderTab(el.dataset.id);
        }
        return;
      }
      /* klik ubin galeri foto -> lightbox (bisa beri catatan) */
      var fig = e.target.closest ? e.target.closest('.item-galeri') : null;
      if (fig && detailAktif) {
        Lightbox.buka(state.fotoTugas, Number(fig.dataset.idx), renderDetail);
      }
    });
    dIsi.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var fig = e.target.closest ? e.target.closest('.item-galeri') : null;
      if (fig && e.target === fig && detailAktif) {
        e.preventDefault();
        Lightbox.buka(state.fotoTugas, Number(fig.dataset.idx), renderDetail);
      }
    });
    dIsi.addEventListener('submit', function (e) {
      if (e.target.id === 'd-tambah-check') {
        e.preventDefault();
        var input = document.getElementById('d-input-check');
        tambahChecklist(input.value.trim());
        input.value = '';
      }
    });
    dIsi.addEventListener('change', function (e) {
      if (e.target.dataset && e.target.dataset.aksi === 'pilih-folder') {
        tautkanFolder(detailAktif, e.target.value);
      }
    });

    /* input file foto tugas (dipicu tombol Unggah di panel detail) */
    document.getElementById('berkas-foto-tugas').addEventListener('change', function (e) {
      tambahFotoTugas(Array.prototype.slice.call(e.target.files || []));
      e.target.value = '';
    });

    formTugas.addEventListener('submit', kirimForm);
  }

  /* ================= API global ================= */

  window.Tasks = {
    muat: muat,
    render: render,
    cari: cari,
    daftar: function () { return state.daftar; },
    state: state,
    simbol: function (s) { return SIMBOL_STATUS[s] || '○'; },
    formatTanggal: formatTanggal,
    bukaForm: bukaForm,
    bukaDetail: bukaDetail,
    tutupDetail: tutupDetail,
    detailDitutup: detailDitutup,
    putarStatus: putarStatus,
    ubahStatus: ubahStatus,
    pasangEvent: pasangEvent
  };
})();
