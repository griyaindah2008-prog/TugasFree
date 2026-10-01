/* ============================================================
   hero.js — Foto utama di halaman utama (mis. jadwal pelajaran).
   - Kartu foto BESAR di atas daftar tugas.
   - Kosong -> kotak "Pasang foto utama" (sekali klik pilih berkas).
   - Klik foto -> Lightbox (zoom pinch/scroll/ketuk-dua-kali) supaya
     tulisan kecil di jadwal tetap kebaca.
   - Tombol Ganti / Hapus di bawah foto.
   - Foto dikompres otomatis dengan sisi maks lebih besar (2200 px)
     daripada foto biasa, supaya detail jadwal tetap tajam saat zoom.
   - Disimpan di store "pengaturan" (kunci "foto-utama"), ikut
     export/import backup (backup versi 3).
   ============================================================ */
(function () {
  'use strict';

  var KUNCI = 'foto-utama';
  var SISI_MAKS_HERO = 2200;

  var state = { foto: null };
  var urlHero = '';

  var IKON_FOTO_BESAR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="m6 17 3.5-3.5 3 3 2.5-2.5 4 4"/></svg>';
  var IKON_ZOOM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/><path d="M11 8.5v5M8.5 11h5"/></svg>';

  /* ================= data ================= */

  function muat() {
    return DB.ambil('pengaturan', KUNCI).then(function (rec) {
      state.foto = (rec && rec.blob instanceof Blob) ? rec : null;
    }).catch(function () {
      state.foto = null;
    });
  }

  function ada() {
    return !!(state.foto && state.foto.blob instanceof Blob);
  }

  /* ================= render ================= */

  function render() {
    var wadah = document.getElementById('hero-isi');
    if (urlHero) { URL.revokeObjectURL(urlHero); urlHero = ''; }

    if (!ada()) {
      wadah.innerHTML =
        '<button type="button" class="hero-kosong" data-aksi="pilih-hero">' +
          '<span class="hk-ikon" aria-hidden="true">' + IKON_FOTO_BESAR + '</span>' +
          '<span class="hk-badan">' +
            '<b>Pasang foto utama</b>' +
            '<small>Mis. jadwal pelajaran — tampil besar di sini, bisa di-zoom.</small>' +
          '</span>' +
          '<span class="btn btn-kecil">Pilih foto</span>' +
        '</button>';
      return;
    }

    urlHero = URL.createObjectURL(state.foto.blob);
    wadah.innerHTML =
      '<figure class="hero-foto" data-aksi="buka-hero" role="button" tabindex="0" ' +
        'aria-label="Lihat foto utama lebih besar (bisa di-zoom)">' +
        '<img src="' + urlHero + '" alt="' + esc(state.foto.name || 'Foto utama') + '" draggable="false">' +
      '</figure>' +
      '<div class="hero-baris">' +
        '<span class="hero-label">' + IKON_ZOOM + ' Ketuk foto untuk memperbesar · ' +
          esc(state.foto.name || 'Foto utama') + '</span>' +
        '<span class="hero-aksi">' +
          '<button type="button" class="btn btn-kecil" data-aksi="ganti-hero">Ganti foto</button>' +
          '<button type="button" class="btn btn-kecil btn-bahaya" data-aksi="hapus-hero">Hapus</button>' +
        '</span>' +
      '</div>';
  }

  /* ================= aksi ================= */

  function pilihFoto() {
    document.getElementById('berkas-foto-utama').click();
  }

  function simpanDariBerkas(berkas) {
    if (!berkas) return;
    if (!berkas.type || berkas.type.indexOf('image/') !== 0) {
      toast('Yang dipilih bukan file gambar — pilih foto (JPG/PNG/WebP).');
      return;
    }
    toast('Memproses foto…');
    var lama = state.foto;
    window.kompresFoto(berkas, SISI_MAKS_HERO).then(function (hasil) {
      var nama = berkas.name || 'foto-utama.jpg';
      if (hasil.berubah) nama = nama.replace(/\.[^.]+$/, '') + '.jpg';
      var rec = {
        kunci: KUNCI,
        name: nama,
        mime: hasil.blob.type || berkas.type || '',
        size: hasil.blob.size,
        blob: hasil.blob,
        createdAt: lama ? lama.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      return DB.simpan('pengaturan', rec).then(function () {
        state.foto = rec;
        render();
        toast(lama ? 'Foto utama diganti.' : 'Foto utama tersimpan.');
      });
    }).catch(function (e) {
      toast('Gagal menyimpan foto: ' + (e && e.message ? e.message : e));
    });
  }

  function hapus() {
    if (!ada()) return;
    return konfirmasi({
      judul: 'Hapus foto utama?',
      pesan: 'Foto utama di halaman depan akan dihapus. Kamu bisa memasang foto baru kapan saja.',
      ya: 'Hapus'
    }).then(function (ok) {
      if (!ok) return;
      DB.hapus('pengaturan', KUNCI).then(function () {
        state.foto = null;
        render();
        toast('Foto utama dihapus.');
      });
    });
  }

  function bukaLightbox() {
    if (!ada()) return;
    /* tanpaCatatan: foto utama bukan item galeri — tombol catatan disembunyikan */
    Lightbox.buka([state.foto], 0, null, true);
  }

  /* ================= event ================= */

  function pasangEvent() {
    document.getElementById('berkas-foto-utama').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) simpanDariBerkas(f);
      e.target.value = '';
    });

    var wadah = document.getElementById('hero-isi');
    wadah.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-aksi]') : null;
      if (!el) return;
      var aksi = el.dataset.aksi;
      if (aksi === 'pilih-hero' || aksi === 'ganti-hero') { pilihFoto(); return; }
      if (aksi === 'hapus-hero') { hapus(); return; }
      if (aksi === 'buka-hero') { bukaLightbox(); return; }
    });
    wadah.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var fig = e.target.closest ? e.target.closest('.hero-foto') : null;
      if (fig && e.target === fig) {
        e.preventDefault();
        bukaLightbox();
      }
    });
  }

  /* ================= API global ================= */

  window.Hero = {
    muat: muat,
    render: render,
    pasangEvent: pasangEvent,
    ada: ada
  };
})();
