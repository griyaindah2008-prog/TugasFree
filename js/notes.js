/* ============================================================
   notes.js — Tab "Catatan": catatan lepas (di luar folder).
   - Tiap catatan: judul (opsional) + isi + TANGGAL DIBUAT + pin.
   - Pin: catatan yang di-pin selalu muncul di seksi "Dipasang"
     paling atas; sisanya urut terbaru dulu.
   - Tanggal dibuat ditampilkan di kartu ("Dibuat Sen, 3 Feb 2026")
     dan di form saat mengedit.
   - Pencarian judul + isi, edit, hapus (dengan konfirmasi).
   ============================================================ */
(function () {
  'use strict';

  var NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  var state = { daftar: [], q: '' };
  var timerCari = null;

  var formNote = document.getElementById('form-note');

  /* ikon SVG untuk konten yang dirender lewat JS */
  var IKON = {
    pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76V7h6v3.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V17H5v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76Z"/><path d="M9 7h6"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    hapus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>'
  };

  /* ================= util ================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* tanggal dibuat dari timestamp: "Sen, 3 Feb 2026" (tahun bila bukan tahun ini) */
  function formatDibuat(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var teks = NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' + NAMA_BULAN[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) teks += ' ' + d.getFullYear();
    return teks;
  }

  /* ================= data ================= */

  function muat() {
    return DB.semua('notes').then(function (hasil) { state.daftar = hasil; });
  }

  function cari(id) {
    return state.daftar.find(function (n) { return n.id === id; }) || null;
  }

  function catatanBaru() {
    return {
      id: uid(),
      judul: '',
      isi: '',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function simpan(n) {
    n.updatedAt = Date.now();
    return DB.simpan('notes', n).then(function () {
      if (!cari(n.id)) state.daftar.push(n);
      return n;
    });
  }

  /* ================= urut & filter ================= */

  /* yang di-pin dulu (antar pin: terbaru dulu), lalu sisanya terbaru dulu */
  function urutkan(arr) {
    return arr.slice().sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function hasilFilter() {
    var q = state.q.trim().toLowerCase();
    if (!q) return state.daftar;
    return state.daftar.filter(function (n) {
      return ((n.judul || '') + ' ' + (n.isi || '')).toLowerCase().indexOf(q) !== -1;
    });
  }

  /* ================= render ================= */

  function kartuCatatan(n) {
    var judul = n.judul ? esc(n.judul) : '<span class="tanpa-judul">Catatan tanpa judul</span>';
    return '' +
      '<article class="kartu-note' + (n.pinned ? ' terpasang' : '') + '" data-id="' + n.id + '" tabindex="0" role="button" aria-label="Buka catatan ' + esc(n.judul || 'tanpa judul') + '">' +
        '<div class="kepala-note">' +
          '<h3 class="judul-note">' + judul + '</h3>' +
          '<button type="button" class="icon-btn icon-kecil btn-pin' + (n.pinned ? ' terpasang' : '') + '" data-aksi="pin" data-id="' + n.id + '" ' +
            'title="' + (n.pinned ? 'Lepas sematan' : 'Sematkan di atas') + '" aria-label="' + (n.pinned ? 'Lepas sematan catatan' : 'Sematkan catatan di atas') + '" aria-pressed="' + (n.pinned ? 'true' : 'false') + '">' + IKON.pin + '</button>' +
        '</div>' +
        '<p class="teks-note">' + esc(n.isi) + '</p>' +
        '<div class="kaki-note">' +
          '<span class="tgl-note">Dibuat ' + esc(formatDibuat(n.createdAt)) + '</span>' +
          '<span class="aksi-note">' +
            '<button type="button" class="icon-btn icon-kecil" data-aksi="edit" data-id="' + n.id + '" title="Edit catatan" aria-label="Edit catatan">' + IKON.edit + '</button>' +
            '<button type="button" class="icon-btn icon-kecil" data-aksi="hapus" data-id="' + n.id + '" title="Hapus catatan" aria-label="Hapus catatan">' + IKON.hapus + '</button>' +
          '</span>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var wadah = document.getElementById('daftar-catatan');
    var kosong = document.getElementById('kosong-catatan');
    var hasil = urutkan(hasilFilter());

    if (!hasil.length) {
      wadah.innerHTML = '';
      kosong.hidden = false;
      var adaData = state.daftar.length > 0;
      kosong.querySelector('.judul-kosong').textContent = adaData ? 'Tidak ada yang cocok' : 'Belum ada catatan';
      kosong.querySelector('.teks-kosong').innerHTML = adaData
        ? 'Coba ubah kata kunci pencariannya.'
        : 'Tekan tombol <b>+ Catatan</b> untuk menyimpan catatan pertamamu — bisa di-pin biar gampang dicari.';
      return;
    }

    kosong.hidden = true;
    var terpasang = hasil.filter(function (n) { return n.pinned; });
    var lainnya = hasil.filter(function (n) { return !n.pinned; });

    var html = '';
    if (terpasang.length && lainnya.length) {
      /* ada campuran: pisah jadi seksi "Dipasang" + "Lainnya" */
      html += '<div class="label-note"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76V7h6v3.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V17H5v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76Z"/><path d="M9 7h6"/></svg>Dipasang <span class="jumlah">' + terpasang.length + '</span></div>' +
        '<div class="grid-note">' + terpasang.map(kartuCatatan).join('') + '</div>';
      html += '<div class="label-note">Lainnya <span class="jumlah">' + lainnya.length + '</span></div>' +
        '<div class="grid-note">' + lainnya.map(kartuCatatan).join('') + '</div>';
    } else {
      /* belum ada yang di-pin (atau semuanya pin): satu daftar saja, tanpa label */
      html += '<div class="grid-note">' + hasil.map(kartuCatatan).join('') + '</div>';
    }
    wadah.innerHTML = html;
  }

  /* ================= form ================= */

  function bukaForm(id) {
    var n = id ? cari(id) : catatanBaru();
    if (!n) return;
    formNote.dataset.id = id || '';
    document.getElementById('note-form-judul').textContent = id ? 'Edit Catatan' : 'Catatan Baru';
    document.getElementById('n-judul').value = n.judul || '';
    document.getElementById('n-isi').value = n.isi || '';
    /* saat edit, tampilkan tanggal dibuat catatan ini */
    var info = document.getElementById('n-info');
    if (id && n.createdAt) {
      info.textContent = 'Dibuat ' + formatDibuat(n.createdAt) + (n.pinned ? ' · sedang di-pin' : '');
      info.hidden = false;
    } else {
      info.hidden = true;
    }
    bukaModal(document.getElementById('modal-note'));
    setTimeout(function () { document.getElementById('n-isi').focus(); }, 60);
  }

  function kirimForm(e) {
    e.preventDefault();
    var isi = document.getElementById('n-isi').value.trim();
    if (!isi) {
      toast('Isi catatan tidak boleh kosong.');
      document.getElementById('n-isi').focus();
      return;
    }
    var id = formNote.dataset.id;
    var n = id ? cari(id) : catatanBaru();
    if (!n) return;
    n.judul = document.getElementById('n-judul').value.trim();
    n.isi = isi;
    simpan(n).then(function () {
      tutupModal(document.getElementById('modal-note'));
      render();
      toast(id ? 'Catatan diperbarui.' : 'Catatan disimpan.');
    }).catch(function (e) { toast('Gagal menyimpan catatan: ' + (e && e.message ? e.message : e)); });
  }

  /* ================= pin ================= */

  function sematkan(id) {
    var n = cari(id);
    if (!n) return Promise.resolve();
    n.pinned = !n.pinned;
    return simpan(n).then(function () {
      render();
      toast(n.pinned ? 'Catatan dipasang di atas — gampang dicari.' : 'Sematan catatan dilepas.');
    });
  }

  /* ================= hapus ================= */

  function konfirmasiHapus(id) {
    var n = cari(id);
    if (!n) return Promise.resolve();
    var nama = n.judul || 'catatan tanpa judul';
    return konfirmasi({
      judul: 'Hapus catatan?',
      pesan: 'Catatan “' + nama + '” (dibuat ' + formatDibuat(n.createdAt) + ') akan dihapus permanen.',
      ya: 'Hapus'
    }).then(function (ok) {
      if (!ok) return;
      return DB.hapus('notes', id).then(function () {
        state.daftar = state.daftar.filter(function (x) { return x.id !== id; });
        render();
        toast('Catatan dihapus.');
      });
    });
  }

  /* ================= event ================= */

  function pasangEvent() {
    /* daftar catatan: klik tombol aksi vs klik kartu (buka edit) */
    document.getElementById('daftar-catatan').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-aksi]') : null;
      if (el) {
        var aksi = el.dataset.aksi;
        if (aksi === 'pin') { sematkan(el.dataset.id); return; }
        if (aksi === 'edit') { bukaForm(el.dataset.id); return; }
        if (aksi === 'hapus') { konfirmasiHapus(el.dataset.id); return; }
      }
      var kartu = e.target.closest ? e.target.closest('.kartu-note') : null;
      if (kartu) bukaForm(kartu.dataset.id);
    });
    document.getElementById('daftar-catatan').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.classList && e.target.classList.contains('kartu-note')) {
        e.preventDefault();
        bukaForm(e.target.dataset.id);
      }
    });

    /* tombol tambah di toolbar (desktop; di HP pakai FAB) */
    document.getElementById('btn-tambah-catatan').addEventListener('click', function () {
      bukaForm(null);
    });

    /* pencarian catatan */
    var cari = document.getElementById('input-cari-catatan');
    cari.addEventListener('input', function () {
      clearTimeout(timerCari);
      timerCari = setTimeout(function () {
        state.q = cari.value;
        render();
      }, 180);
    });

    formNote.addEventListener('submit', kirimForm);
  }

  /* ================= API global ================= */

  window.Notes = {
    muat: muat,
    render: render,
    pasangEvent: pasangEvent,
    bukaForm: bukaForm,
    daftar: function () { return state.daftar; }
  };
})();
