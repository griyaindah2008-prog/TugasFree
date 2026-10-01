/* ============================================================
   app.js — Penghubung seluruh aplikasi (versi dirapikan):
   inisialisasi, tab (atas + nav bawah di HP), FAB ⊕ kontekstual,
   menu ⋯ (export/import backup), modal, toast, konfirmasi,
   tema, pencarian & filter, tombol keyboard (escape, panah,
   +/−/0 untuk zoom foto).
   ============================================================ */
(function () {
  'use strict';

  var tumpukanModal = [];
  var tabAktif = 'tugas';
  var timerCari = null;
  var timerToast = null;

  /* ================= modal ================= */

  function bukaModal(el) {
    if (!el || el.classList.contains('buka')) return;
    el.classList.add('buka');
    el.setAttribute('aria-hidden', 'false');
    tumpukanModal.push(el);
    document.body.classList.add('terkunci');
  }

  function tutupModal(el) {
    if (!el) return;
    el.classList.remove('buka');
    el.setAttribute('aria-hidden', 'true');
    var i = tumpukanModal.indexOf(el);
    if (i > -1) tumpukanModal.splice(i, 1);
    if (!tumpukanModal.length) document.body.classList.remove('terkunci');
    if (el.id === 'modal-detail' && window.Tasks) Tasks.detailDitutup();
  }

  /* ================= toast ================= */

  function toast(pesan) {
    var el = document.getElementById('toast');
    el.textContent = pesan;
    el.classList.add('tampil');
    clearTimeout(timerToast);
    timerToast = setTimeout(function () { el.classList.remove('tampil'); }, 2400);
  }

  /* ================= dialog konfirmasi ================= */

  function konfirmasi(opsi) {
    var modal = document.getElementById('modal-konfirmasi');
    document.getElementById('k-judul').textContent = opsi.judul || 'Yakin?';
    document.getElementById('k-pesan').textContent = opsi.pesan || '';
    var btnYa = document.getElementById('k-ya');
    var btnBatal = document.getElementById('k-batal');
    btnYa.textContent = opsi.ya || 'Ya';
    btnBatal.textContent = opsi.batal || 'Batal';
    bukaModal(modal);
    return new Promise(function (selesai) {
      btnYa.onclick = function () { tutupModal(modal); selesai(true); };
      btnBatal.onclick = function () { tutupModal(modal); selesai(false); };
    });
  }

  /* ================= menu data (⋯) ================= */

  function menuData() { return document.getElementById('menu-data'); }

  function bukaMenu() {
    menuData().hidden = false;
    document.getElementById('btn-menu').setAttribute('aria-expanded', 'true');
  }

  function tutupMenu() {
    menuData().hidden = true;
    document.getElementById('btn-menu').setAttribute('aria-expanded', 'false');
  }

  /* ================= tab ================= */

  function pindahTab(t) {
    tabAktif = t;
    document.getElementById('lihat-tugas').hidden = t !== 'tugas';
    document.getElementById('lihat-folder').hidden = t !== 'folder';
    /* sinkronkan tab atas (desktop) + nav bawah (HP) */
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('aktif', b.dataset.tab === t);
    });
    tutupMenu();
    if (t === 'folder' && window.Folders) Folders.segarkan();
  }

  function bukaFolderTab(idFolder) {
    pindahTab('folder');
    Folders.buka(idFolder);
  }

  /* segarkan tampilan setelah data berubah */
  function segar() {
    if (window.Tasks) Tasks.render();
    if (tabAktif === 'folder' && window.Folders) Folders.segarkan();
  }

  /* muat ulang seluruh state dari IndexedDB (dipakai setelah import) */
  function muatUlang() {
    return Tasks.muat().then(function () {
      return Folders.muat();
    }).then(function () {
      Folders.tampilkanBeranda();
      segar();
    });
  }

  /* ================= tema ================= */

  function gantiTema() {
    var gelap = document.documentElement.classList.toggle('gelap');
    try {
      localStorage.setItem('tugas-tema', gelap ? 'gelap' : 'terang');
    } catch (e) { /* penyimpanan lokal tidak tersedia */ }
    toast(gelap ? 'Mode gelap aktif.' : 'Mode terang aktif.');
  }

  /* ================= inisialisasi ================= */

  function init() {
    if (!window.indexedDB) {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px 20px;border-bottom:1px solid #e7e7e7;font-size:14px;">' +
        'Browser ini tidak mendukung IndexedDB — data tidak bisa disimpan permanen.</div>');
      return;
    }
    Tasks.muat().then(function () {
      return Folders.muat();
    }).then(function () {
      Tasks.render();
      Folders.renderBeranda();
      Tasks.pasangEvent();
      Folders.pasangEvent();
      pasangEventGlobal();
    }).catch(function (e) {
      console.error(e);
      toast('Gagal membuka database: ' + (e && e.message ? e.message : e));
    });
  }

  function pasangEventGlobal() {
    /* tab atas (desktop) + nav bawah (HP) — keduanya punya data-tab */
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { pindahTab(b.dataset.tab); });
    });

    /* tombol kepala */
    document.getElementById('btn-tambah-tugas').addEventListener('click', function () {
      Tasks.bukaForm(null, false);
    });
    document.getElementById('btn-tema').addEventListener('click', gantiTema);

    /* FAB ⊕ (HP): tugas baru di tab Tugas; folder/isi di tab Folder */
    document.getElementById('btn-fab').addEventListener('click', function () {
      if (tabAktif === 'tugas') { Tasks.bukaForm(null, false); return; }
      if (window.Folders) Folders.fabAksi();
    });

    /* menu ⋯ : export / import backup */
    var btnMenu = document.getElementById('btn-menu');
    btnMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuData().hidden) bukaMenu(); else tutupMenu();
    });
    document.addEventListener('click', function (e) {
      if (!menuData().hidden && !e.target.closest('.menu-wadah')) tutupMenu();
    });
    document.getElementById('menu-export').addEventListener('click', function () {
      tutupMenu();
      Backup.exportSemua();
    });
    document.getElementById('menu-import').addEventListener('click', function () {
      tutupMenu();
      document.getElementById('berkas-import').click();
    });
    document.getElementById('berkas-import').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) Backup.importDariBerkas(f);
      e.target.value = '';
    });

    /* pencarian (dengan jeda kecil) & filter status */
    var cari = document.getElementById('input-cari');
    cari.addEventListener('input', function () {
      clearTimeout(timerCari);
      timerCari = setTimeout(function () {
        Tasks.state.filter.q = cari.value;
        Tasks.render();
      }, 180);
    });
    document.getElementById('filter-status').addEventListener('change', function (e) {
      Tasks.state.filter.status = e.target.value;
      Tasks.render();
    });

    /* tutup modal: klik tombol [data-tutup] atau klik area gelap */
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('mousedown', function (e) {
        if (e.target !== m) return;
        if (m.id === 'modal-konfirmasi') {
          document.getElementById('k-batal').click();
        } else {
          tutupModal(m);
        }
      });
    });
    document.querySelectorAll('.modal [data-tutup]').forEach(function (b) {
      b.addEventListener('click', function () {
        tutupModal(b.closest('.modal'));
      });
    });

    /* tombol keyboard: Escape, panah, dan zoom (+/−/0) */
    document.addEventListener('keydown', function (e) {
      var lb = document.getElementById('lightbox');
      var lbTerbuka = lb.classList.contains('buka');
      if (e.key === 'Escape') {
        if (lbTerbuka) { Lightbox.tekanEscape(); return; }
        if (!menuData().hidden) { tutupMenu(); return; }
        if (tumpukanModal.length) {
          var atas = tumpukanModal[tumpukanModal.length - 1];
          if (atas.id === 'modal-konfirmasi') {
            document.getElementById('k-batal').click();
          } else {
            tutupModal(atas);
          }
        }
        return;
      }
      if (lbTerbuka) {
        if (e.key === 'ArrowLeft') Lightbox.geser(-1);
        else if (e.key === 'ArrowRight') Lightbox.geser(1);
        else if (e.key === '+' || e.key === '=') Lightbox.zoomMasuk();
        else if (e.key === '-' || e.key === '_') Lightbox.zoomKeluar();
        else if (e.key === '0') Lightbox.zoomReset();
      }
    });
  }

  /* ================= API global ================= */

  window.App = {
    init: init,
    segar: segar,
    muatUlang: muatUlang,
    pindahTab: pindahTab,
    bukaFolderTab: bukaFolderTab
  };

  /* dipakai lintas modul */
  window.bukaModal = bukaModal;
  window.tutupModal = tutupModal;
  window.toast = toast;
  window.konfirmasi = konfirmasi;

  /* semua script dimuat di akhir <body>: DOM sudah siap */
  App.init();
})();
